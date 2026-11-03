# Форматы JSON-полей

Форматы полей `jsonb` в базе. Имена полей в camelCase, как в API: документы хранятся в том виде, в котором приходят и уходят через API, бэкенд их не переименовывает. Значения перечислений в snake_case, как во всём API.
Ответ API может дополнять хранимый документ: например, бэкенд добавляет к результату название площадки.

## `listing.result`

Результат последней успешной генерации. Перезаписывается только при успехе.

```json
{
  "channels": [
    {
      "channelVersionId": "0192…",
      "title": "2-комнатная квартира 54 м² у метро Лесная",
      "text": "Светлая квартира в 7 минутах от метро…",
      "score": 78,
      "scoreReason": "Есть фото всех комнат, но не указан год постройки",
      "photoIds": ["0192…", "0192…", "0192…"]
    }
  ]
}
```

| Поле | Тип | Смысл и ограничения |
|---|---|---|
| `channels` | массив | Результат по каждой выбранной площадке. Не меньше одного элемента, площадки не повторяются |
| `channelVersionId` | uuid | Версия настроек площадки, на которой получен результат. Площадку бэкенд определяет по версии |
| `title` | строка | Заголовок. Не длиннее лимита заголовка версии (`channel_version.title_limit`) |
| `text` | строка | Текст объявления. Не длиннее лимита текста версии (`channel_version.text_limit`) |
| `score` | целое | Оценка привлекательности объявления для этой площадки, от 0 до 100 |
| `scoreReason` | строка | Обоснование оценки |
| `photoIds` | массив uuid | Фото этого объявления на первые позиции для этой площадки, по порядку. От 0 до 3 элементов, без повторов |

Название площадки в результате не хранится. При чтении объявления бэкенд по `channelVersionId` находит площадку и отдаёт её `id` и текущее название: название не версионируется, поэтому показывается текущее, в том числе для выключенных площадок.

Если фото удалили после генерации, его идентификатор остаётся в `photoIds`. Результат при этом уже помечен устаревшим, а интерфейс не показывает отсутствующее фото.

## `listing.data`

Данные объекта, которые агент вводит в форме. Бэкенд передаёт их в генерацию целиком.
Состав полей взят из XML-схем ЦИАН для агентств ([flatSale](https://www.cian.ru/xml_import/schema/flatSale.xsd), [flatRent](https://www.cian.ru/xml_import/schema/flatRent.xsd), [dailyFlatRent](https://www.cian.ru/xml_import/schema/dailyFlatRent.xsd), [houseSale](https://www.cian.ru/xml_import/schema/houseSale.xsd), [dailyHouseRent](https://www.cian.ru/xml_import/schema/dailyHouseRent.xsd)), имена полей переведены в camelCase, значения перечислений — в snake_case.
Описание полей с примерами заполненных объявлений — в [документации ЦИАН по XML-выгрузке](https://www.cian.ru/xml_import/doc/). Как те же поля выглядят в форме для агента, видно при подаче объявления на ЦИАН.

Общие правила:
- отсутствие поля означает «неизвестно»; `null` не используется;
- у флагов `true` — есть, `false` — нет;
- деньги — целые рубли;
- неполный черновик допустим, обязательные для генерации поля перечислены в конце раздела.

Пример — длительная аренда квартиры:

```json
{
  "deal": {
    "type": "rent",
    "price": 65000,
    "deposit": 65000,
    "commissionPercent": 50,
    "prepayMonths": 1,
    "leaseTerm": "long_term",
    "utilitiesIncluded": false,
    "utilitiesPrice": 4000,
    "metersNotIncluded": true
  },
  "object": {
    "type": "flat",
    "roomsCount": 2,
    "roomType": "separate",
    "totalArea": 54,
    "livingArea": 30,
    "kitchenArea": 10,
    "floor": 7,
    "loggiasCount": 1,
    "windowsView": "yard",
    "separateWcsCount": 1,
    "repairType": "euro"
  },
  "building": { "floorsCount": 12, "buildYear": 2008, "materialType": "brick", "parkingType": "underground" },
  "amenities": { "hasFurniture": true, "hasFridge": true, "hasWasher": true },
  "rules": { "childrenAllowed": true, "petsAllowed": false },
  "location": {
    "address": "Санкт-Петербург, Лесной проспект, 10",
    "undergrounds": [{ "name": "Лесная", "minutes": 7, "transportType": "walk" }]
  },
  "extra": "Окна во двор, тихо. Рядом школа № 95 и парк"
}
```

### `deal` — сделка

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `type` | строка | `sale`, `rent` (длительная аренда), `daily_rent` (посуточно) | Всегда |
| `price` | целое | Рубли: за объект, в месяц или в сутки | Всегда |
| `saleType` | строка | `free` (свободная продажа), `alternative` (альтернатива) | Продажа |
| `mortgageAllowed` | флаг | | Продажа |
| `deposit` | целое | Залог в рублях, `0` — без залога | Аренда, посуточно |
| `commissionPercent` | целое | Комиссия в процентах, `0` — без комиссии | Аренда |
| `prepayMonths` | целое | Предоплата в месяцах | Аренда |
| `leaseTerm` | строка | `few_months`, `long_term` | Аренда |
| `utilitiesIncluded` | флаг | Коммунальные включены в цену | Аренда |
| `utilitiesPrice` | целое | Коммунальные в рублях в месяц | Аренда |
| `metersNotIncluded` | флаг | Счётчики оплачиваются отдельно | Аренда |

### `object` — объект

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `type` | строка | `flat`, `room`, `house` | Всегда |
| `totalArea` | число | м² | Всегда |
| `repairType` | строка | `cosmetic`, `design`, `euro`, `no` | Всегда |
| `isApartments`, `isPenthouse`, `isEuroFlat` | флаг | | Квартира |
| `roomsCount` | целое | | Квартира |
| `roomType` | строка | `separate` (изолированные), `combined` (смежные), `both` | Квартира |
| `livingArea`, `kitchenArea` | число | м² | Квартира, комната |
| `floor` | целое | | Квартира, комната |
| `balconiesCount`, `loggiasCount` | целое | | Квартира, комната |
| `windowsView` | строка | `street`, `yard`, `yard_and_street` | Квартира, комната |
| `separateWcsCount`, `combinedWcsCount` | целое | | Квартира, комната |
| `bedroomsCount`, `wcsCount` | целое | | Дом |
| `wcLocation` | строка | `indoors`, `outdoors` | Дом |

Поля, специфичные для комнаты (площадь комнаты, число комнат в квартире), не уточнены: схема ЦИАН для комнат недоступна.

### `building` — дом, в котором квартира или комната

| Поле | Тип | Значения |
|---|---|---|
| `floorsCount` | целое | Этажность |
| `buildYear` | целое | |
| `materialType` | строка | `block`, `boards`, `brick`, `monolith`, `monolith_brick`, `old`, `panel`, `stalin`, `wood`, `wireframe`, `aerocrete_block`, `gas_silicate_block`, `foam_concrete_block` |
| `ceilingHeight` | число | м |
| `passengerLiftsCount`, `cargoLiftsCount` | целое | |
| `hasGarbageChute` | флаг | |
| `parkingType` | строка | `ground`, `multilevel`, `roof`, `underground`, `open` |
| `hasBarrierYard`, `hasCarFreeCourt`, `hasConcierge` | флаг | Закрытый двор, двор без машин, консьерж |

### `house` — дом и участок

| Поле | Тип | Значения |
|---|---|---|
| `floorsCount`, `buildYear` | целое | |
| `isDacha` | флаг | |
| `materialTypes` | массив строк | `boards`, `brick`, `monolith`, `wood`, `wireframe`, `aerocrete_block`, `gas_silicate_block`, `foam_concrete_block`, `solid_wood`, `glued_laminated_timber`, `sip_panels`, `reinforced_concrete_panels`, `metal_frame`, `expanded_clay_concrete`, `slag_concrete`, `arbolit` |
| `condition` | строка | `ready`, `interior_decoration_required`, `unfinished`, `major_repairs_required` |
| `heatingType` | строка | `fireplace`, `no`, `stove`, `central_gas`, `central_coal`, `electric`, `autonomous_gas`, `diesel`, `solid_fuel_boiler` |
| `gasType` | строка | `main`, `border`, `gas_holder`, `gas_bottle` |
| `waterType` | строка | `central`, `borehole`, `well` |
| `drainageType` | строка | `central`, `septic_tank`, `cesspool` |
| `hasElectricity` | флаг | |
| `hasTerrace`, `hasCellar`, `hasBathhouse`, `hasGarage`, `hasPool`, `hasSecurity` | флаг | |
| `landArea` | число | |
| `landAreaUnit` | строка | `sotka`, `hectare` |
| `landUseType` | строка | `farm`, `private_farm`, `gardening`, `individual_housing_construction`, `suburban_non_profit_partnership`, `horticulture`, `other` |
| `landCategory` | строка | `for_agricultural_purposes`, `settlements`, `other` |

### `amenities` — оснащение (аренда и посуточно)

Флаги: `hasFurniture`, `hasKitchenFurniture`, `hasFridge`, `hasWasher`, `hasDishwasher`, `hasConditioner`, `hasTv`, `hasInternet`, `hasBathtub`, `hasShower`.

### `rules` — условия проживания (аренда и посуточно)

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `childrenAllowed`, `petsAllowed` | флаг | | Аренда, посуточно |
| `bedsCount`, `guestsCount` | целое | | Посуточно |
| `checkInTime`, `checkOutTime` | строка | `ЧЧ:ММ` | Посуточно |
| `smoking` | строка | `allowed`, `forbidden`, `designated_areas_only` | Посуточно |
| `parties` | строка | `allowed`, `forbidden`, `by_agreement` | Посуточно |
| `contactlessCheckin` | флаг | | Посуточно |

### `legal` — юридические особенности (продажа)

Флаги: `hasRedevelopment` (квартира), `hasMinorOwners`, `maternityCapitalUsed`.

### `location` — расположение

| Поле | Тип | Значения |
|---|---|---|
| `address` | строка | |
| `undergrounds` | массив | Станции метро: `name` (строка), `minutes` (целое), `transportType` (`walk`, `transport`) |

У ЦИАН станция выбирается по ID из справочника; у нас — по названию, справочника станций нет.

### `extra` — дополнительная информация

Свободный текст агента: инфраструктура рядом, особенности объекта, пожелания к тексту.

### Обязательные поля для генерации

- `deal.type`, `deal.price` больше нуля;
- `object.type`, `object.totalArea` больше нуля;
- `location.address`;
- для квартиры — `object.roomsCount`;
- для аренды — `deal.deposit` и `deal.commissionPercent`.

### Предупреждения о противоречиях

- `object.floor` больше `building.floorsCount`;
- `object.livingArea` или `object.kitchenArea` больше `object.totalArea`.
