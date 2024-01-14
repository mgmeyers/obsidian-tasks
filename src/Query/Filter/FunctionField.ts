import type { Task } from '../../Task';
import type { GrouperFunction } from '../Grouper';
import { Grouper } from '../Grouper';
import { Explanation } from '../Explain/Explanation';
import { TaskExpression, parseAndEvaluateExpression } from '../../Scripting/TaskExpression';
import type { QueryContext } from '../../Scripting/QueryContext';
import type { SearchInfo } from '../SearchInfo';
import { Sorter } from '../Sorter';
import { Field } from './Field';
import { Filter, type FilterFunction } from './Filter';
import { FilterOrErrorMessage } from './FilterOrErrorMessage';

/**
 * A {@link Field} implement that accepts a JavaScript expression to filter or group tasks.
 *
 * See also {@link parseAndEvaluateExpression}
 */
export class FunctionField extends Field {
    // -----------------------------------------------------------------------------------------------------------------
    // Filtering
    // -----------------------------------------------------------------------------------------------------------------

    createFilterOrErrorMessage(line: string): FilterOrErrorMessage {
        const match = Field.getMatch(this.filterRegExp(), line);
        if (match === null) {
            return FilterOrErrorMessage.fromError(line, 'Unable to parse line');
        }

        const expression = match[1];
        const taskExpression = new TaskExpression(expression);
        if (!taskExpression.isValid()) {
            return FilterOrErrorMessage.fromError(line, taskExpression.parseError!);
        }

        return FilterOrErrorMessage.fromFilter(
            new Filter(line, createFilterFunctionFromLine(taskExpression), new Explanation(line)),
        );
    }

    fieldName(): string {
        return 'function';
    }

    protected filterRegExp(): RegExp | null {
        return new RegExp(`^filter by ${this.fieldNameSingularEscaped()} (.*)`, 'i');
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Sorting
    // -----------------------------------------------------------------------------------------------------------------

    public supportsSorting(): boolean {
        return true;
    }

    protected sorterRegExp(): RegExp {
        return new RegExp(`^sort by ${this.fieldNameSingularEscaped()}( reverse)? (.*)`, 'i');
    }

    public createSorterFromLine(line: string): Sorter | null {
        const match = Field.getMatch(this.sorterRegExp(), line);
        if (match === null) {
            return null;
        }

        const reverse = !!match[1];
        const expression = match[2];
        const taskExpression = new TaskExpression(expression);
        if (!taskExpression.isValid()) {
            // TODO Figure out error handling
            // return FilterOrErrorMessage.fromError(line, taskExpression.parseError!);
            return null;
        }
        const comparator = (a: Task, b: Task) => {
            const valueA = this.validateTaskSortKey(taskExpression.evaluate(a), line);
            const valueB = this.validateTaskSortKey(taskExpression.evaluate(b), line);
            return this.compareTaskSortKeys(valueA, valueB, line);
        };
        return new Sorter(line, this.fieldNameSingular(), comparator, reverse);
    }

    public validateTaskSortKey(sortKey: any, line: string) {
        if (sortKey === undefined) {
            throw new Error(`"undefined" is not a valid sort key, from expression: "${line}"`);
        }
        if (Number.isNaN(sortKey)) {
            throw new Error(`"NaN (Not a Number)" is not a valid sort key, from expression: "${line}"`);
        }
        if (Array.isArray(sortKey)) {
            throw new Error(`"array" is not a valid sort key, from expression: "${line}"`);
        }
        return sortKey;
    }

    /**
     * A comparator function for sorting two values
     *
     * **IMPORTANT**: Both values must already have been checked by {@link validateTaskSortKey}.
     *
     * - If the result is negative, a is sorted before b.
     * - If the result is positive, b is sorted before a.
     * - If the result is 0, no changes are done with the sort order of the two values.
     *
     * @param valueA - a value that satisfies {@link validateTaskSortKey}.
     * @param valueB - a value that satisfies {@link validateTaskSortKey}.
     * @param line - the instruction line: used for error messages.
     */
    public compareTaskSortKeys(valueA: any, valueB: any, line: string) {
        // Precondition: Both parameter values have satisfied constraints in validateTaskSortKey().

        if (valueA === null && valueB === null) {
            return 0;
        }

        // Null sorts before anything else.
        // This is consistent with how null headings are handled.
        // However, it differs from how compareByDate() works, so special-case code will be needed
        // for that, later.
        if (valueA === null && valueB !== null) {
            return -1;
        }
        if (valueA !== null && valueB === null) {
            return 1;
        }

        const valueAType = typeof valueA;
        const valueBType = typeof valueB;
        if (valueAType !== valueBType) {
            throw new Error(
                `Unable to compare two different types: '${valueAType}' and '${valueBType}' order for expression '${line}'`,
            );
        }

        if (valueAType === 'string') {
            return valueA.localeCompare(valueB, undefined, { numeric: true });
        }

        // Treat as numeric, so it works well with booleans
        // We use Number() to prevent implicit type conversion, by making the conversion explicit:
        const result = Number(valueA) - Number(valueB);
        if (isNaN(result)) {
            throw new Error(`Unable to determine sort order for expression '${line}'`);
        }
        return result;
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Grouping
    // -----------------------------------------------------------------------------------------------------------------

    public supportsGrouping(): boolean {
        return true;
    }

    public createGrouperFromLine(line: string): Grouper | null {
        const match = Field.getMatch(this.grouperRegExp(), line);
        if (match === null) {
            return null;
        }
        const reverse = !!match[1];
        const args = match[2];
        return new Grouper(line, 'function', createGrouperFunctionFromLine(args), reverse);
    }

    protected grouperRegExp(): RegExp {
        return new RegExp(`^group by ${this.fieldNameSingularEscaped()}( reverse)? (.*)`, 'i');
    }

    /**
     * This method does not work for 'group by function' as the user's instruction line
     * is required in order to create the {@link GrouperFunction}.
     *
     * So this class overrides {@link createGrouperFromLine} instead.
     * @throws Error
     */
    public grouper(): GrouperFunction {
        throw Error('grouper() function not valid for FunctionField. Use createGrouperFromLine() instead.');
    }
}

// -----------------------------------------------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------------------------------------------

function createFilterFunctionFromLine(expression: TaskExpression): FilterFunction {
    return (task: Task, searchInfo: SearchInfo) => {
        const queryContext = searchInfo.queryContext();
        return filterByFunction(expression, task, queryContext);
    };
}

export function filterByFunction(expression: TaskExpression, task: Task, queryContext?: QueryContext): boolean {
    // Allow exceptions to propagate to caller, since this will be called in a tight loop.
    // In searches, it will be caught by Query.applyQueryToTasks().
    const result = expression.evaluate(task, queryContext);

    // We insist that 'filter by function' returns booleans,
    // to avoid users having to understand truthy and falsey values.
    if (typeof result === 'boolean') {
        return result;
    }

    throw Error(`filtering function must return true or false. This returned "${result}".`);
}

// -----------------------------------------------------------------------------------------------------------------
// Grouping
// -----------------------------------------------------------------------------------------------------------------

type GroupingArg = string;

function createGrouperFunctionFromLine(line: string): GrouperFunction {
    return (task: Task, searchInfo: SearchInfo) => {
        const queryContext = searchInfo.queryContext();
        return groupByFunction(task, line, queryContext);
    };
}

export function groupByFunction(task: Task, arg: GroupingArg, queryContext?: QueryContext): string[] {
    try {
        const result = parseAndEvaluateExpression(task, arg, queryContext);

        if (Array.isArray(result)) {
            return result.map((h) => h.toString());
        }

        // Task uses null to represent missing information.
        // So we treat null as an empty group or 'not in a heading', for simplicity for users.
        // This can be overridden with 'null || "No value"
        if (result === null) {
            return [];
        }

        // If there was an error in the expression, like it referred to
        // an unknown task field, result will be undefined, and the call
        // on undefined.toString() will give an exception and a useful error
        // message below. This is a feature: it gives users feedback on the problem
        // instruction line.
        const group = result.toString();
        return [group];
    } catch (e) {
        const errorMessage = `Error: Failed calculating expression "${arg}". The error message was: `;
        if (e instanceof Error) {
            return [errorMessage + e.message];
        } else {
            return [errorMessage + 'Unknown error'];
        }
    }
}
