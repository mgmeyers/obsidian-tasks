import { diff } from 'jest-diff';

declare global {
    namespace jest {
        interface Matchers<R> {
            toHaveDataAttributes(expectedDataAttributes: string): R;
            toHaveAChildSpanWithClassAndDataAttributes(expectedClass: string, expectedDataAttributes: string): R;
        }

        interface Expect {
            toHaveDataAttributes(expectedDataAttributes: string): any;
            toHaveAChildSpanWithClassAndDataAttributes(expectedClass: string, expectedDataAttributes: string): any;
        }

        interface InverseAsymmetricMatchers {
            toHaveDataAttributes(expectedDataAttributes: string): any;
            toHaveAChildSpanWithClassAndDataAttributes(expectedClass: string, expectedDataAttributes: string): any;
        }
    }
}

function getTextSpan(listItem: HTMLLIElement) {
    return listItem.children[1] as HTMLSpanElement;
}

function getDataAttributesAsString(element: HTMLElement): string {
    const dataAttributes = element.dataset;
    const keys = Object.keys(dataAttributes);

    return keys.map((key) => `${key}: ${dataAttributes[key]}`).join('\n');
}

export function toHaveDataAttributes(htmlElement: HTMLElement, expectedDataAttributes: string) {
    const renderedDataAttributes = getDataAttributesAsString(htmlElement);

    const pass: boolean = renderedDataAttributes === expectedDataAttributes;
    const message: () => string = () =>
        pass
            ? `Data attributes should not be\n${renderedDataAttributes}`
            : `Data attributes are not the same as expected:\n${diff(expectedDataAttributes, renderedDataAttributes)}`;
    return {
        message,
        pass,
    };
}

export function toHaveAChildSpanWithClassAndDataAttributes(
    listItem: HTMLLIElement,
    expectedClass: string,
    expectedDataAttributes: string,
) {
    const textSpan = getTextSpan(listItem);
    const childSpans = Array.from(textSpan.children) as HTMLSpanElement[];

    for (const childSpan of childSpans) {
        if (childSpan.className === expectedClass) {
            const renderedDataAttributes = getDataAttributesAsString(childSpan);
            const pass: boolean = renderedDataAttributes === expectedDataAttributes;
            const message: () => string = () =>
                pass
                    ? `Data attributes for the span with '${expectedClass}' class should not be\n${renderedDataAttributes}`
                    : `Data attributes for the span with '${expectedClass}' class are not the same as expected:\n${diff(
                          expectedDataAttributes,
                          renderedDataAttributes,
                      )}`;
            return {
                message,
                pass,
            };
        }
    }

    const foundChildSpans = childSpans.map((childSpan) => childSpan.className).join('\n');
    return {
        message: () =>
            `The rendered list item does not contain a span with class '${expectedClass}'. Found spans with classes:\n${foundChildSpans}`,
        pass: false,
    };
}
