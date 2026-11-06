# POS route convention

All POS endpoints must live under `stores/[store_code]/` and take their store
code from the URL. Do not create shared routes that obtain the store code from
the JSON body. This applies to every future POS resource as well.

Keep bearer-token authorization scoped to the URL's store. A body store code
must never be used as a fallback for a missing URL store code.

For each new POS API, provide one concise JSON example showing important fields,
including description where supported. Avoid duplicate example files and extra
fields in the main example. Document the complete supported field list and blank
semantics separately. Required identifiers, names and create-time dependencies
must remain validated.
