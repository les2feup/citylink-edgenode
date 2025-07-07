import type { ThingDescription } from "npm:wot-thing-description-types";
import { createLogger } from "../logging/log.ts";

const logger = createLogger("common", "td-transforms-mqtt");

export function fillPlatfromForms(
    td: WoT.ExposedThingInit,
    map: Record<string, string>,
): ThingDescription {
    const merge = (prop_name: string) => {
        return {
            readOnly: true,
            writeOnly: false,
            forms: [
                {
                    href: map.CITYLINK_HREF,
                    "mqv:filter":
                        `${map.CITYLINK_PROPERTY}/platform/${prop_name}`,
                    "mqv:qos": 1,
                    "mqv:retain": true,
                    op: "readproperty",
                    contentType: "application/json",
                },
            ],
        };
    };

    const properties = td.properties!;
    const prefix = "citylink:platform_";
    // map over properties that start with the citylink:platfrom prefix
    // citylink:platform_<prop_name> and apply the merge
    for (const key of Object.keys(properties)) {
        if (key.startsWith(prefix) && !properties[key]?.forms) {
            const actualPropName = key.slice(prefix.length);
            const merged = merge(actualPropName);
            const original = properties[key]!;

            // Merge values (non-destructively)
            properties[key] = {
                ...original,
                ...merged,
                forms: [...(original.forms ?? []), ...merged.forms],
            };

            logger.debug(
                "Filled platform form for",
                actualPropName,
                "in TD",
                td.id,
            );
        }
    }

    return td as ThingDescription;
}

export function createTopLevelForms(
    td: ThingDescription,
    map: Record<string, string>,
): ThingDescription {
    const topLevel = [
        {
            href: map.CITYLINK_HREF,
            "mqv:filter": `${map.CITYLINK_PROPERTY}/#`,
            "mqv:qos": 1,
            "mqv:retain": true,
            op: [
                "observeallproperties",
                "unobserveallproperties",
            ],
            contentType: "application/json",
        },
        {
            href: map.CITYLINK_HREF,
            "mqv:filter": `${map.CITYLINK_EVENT}/#`,
            "mqv:qos": 1,
            "mqv:retain": false,
            op: [
                "subscribeallevents",
                "unsubscribeallevents",
            ],
            contentType: "application/json",
        },
    ];

    // add the new top level forms into the forms array
    const prev = (td.forms || []) as NonNullable<ThingDescription["forms"]>;
    td.forms = [...prev, ...topLevel];
    logger.debug(
        { thingId: td.id, thingName: td.title },
        `Added top-level forms to Thing Description`,
    );
    return td;
}
