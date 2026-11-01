# Форматы JSON-полей

Форматы полей `jsonb` в базе. Названия в snake_case, как в остальной схеме.
Формат хранения не обязан совпадать с ответом API: бэкенд дополняет данные при чтении.

## `listing.result`

Результат последней успешной генерации. Перезаписывается только при успехе.

```json
{
  "channels": [
    {
      "channel_version_id": "0192…",
      "title": "2-комнатная квартира 54 м² у метро Лесная",
      "text": "Светлая квартира в 7 минутах от метро…",
      "score": 78,
      "score_reason": "Есть фото всех комнат, но не указан год постройки",
      "photo_ids": ["0192…", "0192…", "0192…"]
    }
  ]
}
```

| Поле | Тип | Смысл и ограничения |
|---|---|---|
| `channels` | массив | Результат по каждой выбранной площадке. Не меньше одного элемента, площадки не повторяются |
| `channel_version_id` | uuid | Версия настроек площадки, на которой получен результат. Площадку бэкенд определяет по версии |
| `title` | строка | Заголовок. Не длиннее `title_limit` версии |
| `text` | строка | Текст объявления. Не длиннее `text_limit` версии |
| `score` | целое | Оценка привлекательности объявления для этой площадки, от 0 до 100 |
| `score_reason` | строка | Обоснование оценки |
| `photo_ids` | массив uuid | Фото этого объявления на первые позиции для этой площадки, по порядку. От 0 до 3 элементов, без повторов |

Название площадки в результате не хранится. При чтении объявления бэкенд по `channel_version_id` находит площадку и отдаёт её `id` и текущее название: название не версионируется, поэтому показывается текущее, в том числе для выключенных площадок.

Если фото удалили после генерации, его идентификатор остаётся в `photo_ids`. Результат при этом уже помечен устаревшим, а интерфейс не показывает отсутствующее фото.

## `listing.data`

Данные объекта, которые агент вводит в форме. Бэкенд передаёт их в генерацию целиком.
Состав полей взят из XML-схем ЦИАН для агентств ([flatSale](https://www.cian.ru/xml_import/schema/flatSale.xsd), [flatRent](https://www.cian.ru/xml_import/schema/flatRent.xsd), [dailyFlatRent](https://www.cian.ru/xml_import/schema/dailyFlatRent.xsd), [houseSale](https://www.cian.ru/xml_import/schema/houseSale.xsd), [dailyHouseRent](https://www.cian.ru/xml_import/schema/dailyHouseRent.xsd)), значения переведены в snake_case.
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
    "commission_percent": 50,
    "prepay_months": 1,
    "lease_term": "long_term",
    "utilities_included": false,
    "utilities_price": 4000,
    "meters_not_included": true
  },
  "object": {
    "type": "flat",
    "rooms_count": 2,
    "room_type": "separate",
    "total_area": 54,
    "living_area": 30,
    "kitchen_area": 10,
    "floor": 7,
    "loggias_count": 1,
    "windows_view": "yard",
    "separate_wcs_count": 1,
    "repair_type": "euro"
  },
  "building": { "floors_count": 12, "build_year": 2008, "material_type": "brick", "parking_type": "underground" },
  "amenities": { "has_furniture": true, "has_fridge": true, "has_washer": true },
  "rules": { "children_allowed": true, "pets_allowed": false },
  "location": {
    "address": "Санкт-Петербург, Лесной проспект, 10",
    "undergrounds": [{ "name": "Лесная", "minutes": 7, "transport_type": "walk" }]
  },
  "extra": "Окна во двор, тихо. Рядом школа № 95 и парк"
}
```

### `deal` — сделка

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `type` | строка | `sale`, `rent` (длительная аренда), `daily_rent` (посуточно) | Всегда |
| `price` | целое | Рубли: за объект, в месяц или в сутки | Всегда |
| `sale_type` | строка | `free` (свободная продажа), `alternative` (альтернатива) | Продажа |
| `mortgage_allowed` | флаг | | Продажа |
| `deposit` | целое | Залог в рублях, `0` — без залога | Аренда, посуточно |
| `commission_percent` | целое | Комиссия в процентах, `0` — без комиссии | Аренда |
| `prepay_months` | целое | Предоплата в месяцах | Аренда |
| `lease_term` | строка | `few_months`, `long_term` | Аренда |
| `utilities_included` | флаг | Коммунальные включены в цену | Аренда |
| `utilities_price` | целое | Коммунальные в рублях в месяц | Аренда |
| `meters_not_included` | флаг | Счётчики оплачиваются отдельно | Аренда |

### `object` — объект

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `type` | строка | `flat`, `room`, `house` | Всегда |
| `total_area` | число | м² | Всегда |
| `repair_type` | строка | `cosmetic`, `design`, `euro`, `no` | Всегда |
| `is_apartments`, `is_penthouse`, `is_euro_flat` | флаг | | Квартира |
| `rooms_count` | целое | | Квартира |
| `room_type` | строка | `separate` (изолированные), `combined` (смежные), `both` | Квартира |
| `living_area`, `kitchen_area` | число | м² | Квартира, комната |
| `floor` | целое | | Квартира, комната |
| `balconies_count`, `loggias_count` | целое | | Квартира, комната |
| `windows_view` | строка | `street`, `yard`, `yard_and_street` | Квартира, комната |
| `separate_wcs_count`, `combined_wcs_count` | целое | | Квартира, комната |
| `bedrooms_count`, `wcs_count` | целое | | Дом |
| `wc_location` | строка | `indoors`, `outdoors` | Дом |

Поля, специфичные для комнаты (площадь комнаты, число комнат в квартире), не уточнены: схема ЦИАН для комнат недоступна.

### `building` — дом, в котором квартира или комната

| Поле | Тип | Значения |
|---|---|---|
| `floors_count` | целое | Этажность |
| `build_year` | целое | |
| `material_type` | строка | `block`, `boards`, `brick`, `monolith`, `monolith_brick`, `old`, `panel`, `stalin`, `wood`, `wireframe`, `aerocrete_block`, `gas_silicate_block`, `foam_concrete_block` |
| `ceiling_height` | число | м |
| `passenger_lifts_count`, `cargo_lifts_count` | целое | |
| `has_garbage_chute` | флаг | |
| `parking_type` | строка | `ground`, `multilevel`, `roof`, `underground`, `open` |
| `has_barrier_yard`, `has_car_free_court`, `has_concierge` | флаг | Закрытый двор, двор без машин, консьерж |

### `house` — дом и участок

| Поле | Тип | Значения |
|---|---|---|
| `floors_count`, `build_year` | целое | |
| `is_dacha` | флаг | |
| `material_types` | массив строк | `boards`, `brick`, `monolith`, `wood`, `wireframe`, `aerocrete_block`, `gas_silicate_block`, `foam_concrete_block`, `solid_wood`, `glued_laminated_timber`, `sip_panels`, `reinforced_concrete_panels`, `metal_frame`, `expanded_clay_concrete`, `slag_concrete`, `arbolit` |
| `condition` | строка | `ready`, `interior_decoration_required`, `unfinished`, `major_repairs_required` |
| `heating_type` | строка | `fireplace`, `no`, `stove`, `central_gas`, `central_coal`, `electric`, `autonomous_gas`, `diesel`, `solid_fuel_boiler` |
| `gas_type` | строка | `main`, `border`, `gas_holder`, `gas_bottle` |
| `water_type` | строка | `central`, `borehole`, `well` |
| `drainage_type` | строка | `central`, `septic_tank`, `cesspool` |
| `has_electricity` | флаг | |
| `has_terrace`, `has_cellar`, `has_bathhouse`, `has_garage`, `has_pool`, `has_security` | флаг | |
| `land_area` | число | |
| `land_area_unit` | строка | `sotka`, `hectare` |
| `land_use_type` | строка | `farm`, `private_farm`, `gardening`, `individual_housing_construction`, `suburban_non_profit_partnership`, `horticulture`, `other` |
| `land_category` | строка | `for_agricultural_purposes`, `settlements`, `other` |

### `amenities` — оснащение (аренда и посуточно)

Флаги: `has_furniture`, `has_kitchen_furniture`, `has_fridge`, `has_washer`, `has_dishwasher`, `has_conditioner`, `has_tv`, `has_internet`, `has_bathtub`, `has_shower`.

### `rules` — условия проживания (аренда и посуточно)

| Поле | Тип | Значения | Когда |
|---|---|---|---|
| `children_allowed`, `pets_allowed` | флаг | | Аренда, посуточно |
| `beds_count`, `guests_count` | целое | | Посуточно |
| `check_in_time`, `check_out_time` | строка | `ЧЧ:ММ` | Посуточно |
| `smoking` | строка | `allowed`, `forbidden`, `designated_areas_only` | Посуточно |
| `parties` | строка | `allowed`, `forbidden`, `by_agreement` | Посуточно |
| `contactless_checkin` | флаг | | Посуточно |

### `legal` — юридические особенности (продажа)

Флаги: `has_redevelopment` (квартира), `has_minor_owners`, `maternity_capital_used`.

### `location` — расположение

| Поле | Тип | Значения |
|---|---|---|
| `address` | строка | |
| `undergrounds` | массив | Станции метро: `name` (строка), `minutes` (целое), `transport_type` (`walk`, `transport`) |

У ЦИАН станция выбирается по ID из справочника; у нас — по названию, справочника станций нет.

### `extra` — дополнительная информация

Свободный текст агента: инфраструктура рядом, особенности объекта, пожелания к тексту.

### Обязательные поля для генерации

- `deal.type`, `deal.price` больше нуля;
- `object.type`, `object.total_area` больше нуля;
- `location.address`;
- для квартиры — `object.rooms_count`;
- для аренды — `deal.deposit` и `deal.commission_percent`.

### Предупреждения о противоречиях

- `object.floor` больше `building.floors_count`;
- `object.living_area` или `object.kitchen_area` больше `object.total_area`.
