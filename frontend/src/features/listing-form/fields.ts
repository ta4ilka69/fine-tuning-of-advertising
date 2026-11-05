import { listingRules } from '../../shared/api/listing-rules';

export const sections = [
  ['deal', 'Сделка'], ['object', 'Объект'], ['building', 'Здание'], ['house', 'Дом и участок'],
  ['amenities', 'Оснащение'], ['rules', 'Условия проживания'], ['legal', 'Юридические особенности'],
  ['location', 'Расположение'], ['extra', 'Дополнительная информация'],
] as const;

export const labels: Record<string, string> = {
  'deal.type': 'Тип сделки', 'deal.price': 'Цена, ₽', 'deal.saleType': 'Условия продажи', 'deal.mortgageAllowed': 'Возможна ипотека',
  'deal.deposit': 'Залог, ₽', 'deal.commissionPercent': 'Комиссия, %', 'deal.prepayMonths': 'Предоплата, месяцев',
  'deal.leaseTerm': 'Срок аренды', 'deal.utilitiesIncluded': 'Коммунальные платежи включены', 'deal.utilitiesPrice': 'Коммунальные платежи, ₽ в месяц',
  'deal.metersNotIncluded': 'Счётчики оплачиваются отдельно', 'object.type': 'Тип недвижимости', 'object.totalArea': 'Общая площадь, м²',
  'object.roomsCount': 'Количество комнат', 'object.repairType': 'Ремонт', 'object.isApartments': 'Апартаменты', 'object.isPenthouse': 'Пентхаус', 'object.isEuroFlat': 'Европланировка',
  'object.roomType': 'Планировка комнат', 'object.livingArea': 'Жилая площадь, м²',
  'object.kitchenArea': 'Площадь кухни, м²', 'object.floor': 'Этаж', 'object.balconiesCount': 'Количество балконов', 'object.loggiasCount': 'Количество лоджий',
  'object.windowsView': 'Вид из окон', 'object.separateWcsCount': 'Раздельных санузлов', 'object.combinedWcsCount': 'Совмещённых санузлов',
  'object.bedroomsCount': 'Количество спален', 'object.wcsCount': 'Количество санузлов', 'object.wcLocation': 'Расположение санузла',
  'building.floorsCount': 'Этажей в здании', 'building.buildYear': 'Год постройки здания', 'building.materialType': 'Материал здания',
  'building.ceilingHeight': 'Высота потолков, м', 'building.passengerLiftsCount': 'Пассажирских лифтов', 'building.cargoLiftsCount': 'Грузовых лифтов',
  'building.hasGarbageChute': 'Мусоропровод', 'building.parkingType': 'Парковка', 'building.hasBarrierYard': 'Закрытый двор',
  'building.hasCarFreeCourt': 'Двор без машин', 'building.hasConcierge': 'Консьерж',
  'house.floorsCount': 'Этажей в доме', 'house.buildYear': 'Год постройки дома', 'house.isDacha': 'Дача', 'house.materialTypes': 'Материалы дома',
  'house.condition': 'Состояние дома', 'house.heatingType': 'Отопление', 'house.gasType': 'Газ', 'house.waterType': 'Водоснабжение', 'house.drainageType': 'Канализация',
  'house.hasElectricity': 'Электричество', 'house.hasTerrace': 'Терраса', 'house.hasCellar': 'Погреб', 'house.hasBathhouse': 'Баня',
  'house.hasGarage': 'Гараж', 'house.hasPool': 'Бассейн', 'house.hasSecurity': 'Охрана', 'house.landArea': 'Площадь участка',
  'house.landAreaUnit': 'Единица площади участка', 'house.landUseType': 'Использование участка', 'house.landCategory': 'Категория земель',
  'amenities.hasFurniture': 'Мебель', 'amenities.hasKitchenFurniture': 'Мебель на кухне', 'amenities.hasFridge': 'Холодильник', 'amenities.hasWasher': 'Стиральная машина',
  'amenities.hasDishwasher': 'Посудомоечная машина', 'amenities.hasConditioner': 'Кондиционер', 'amenities.hasTv': 'Телевизор', 'amenities.hasInternet': 'Интернет',
  'amenities.hasBathtub': 'Ванна', 'amenities.hasShower': 'Душ', 'rules.childrenAllowed': 'Можно с детьми', 'rules.petsAllowed': 'Можно с животными',
  'rules.bedsCount': 'Спальных мест', 'rules.guestsCount': 'Количество гостей', 'rules.checkInTime': 'Время заезда', 'rules.checkOutTime': 'Время выезда',
  'rules.smoking': 'Курение', 'rules.parties': 'Вечеринки', 'rules.contactlessCheckin': 'Бесконтактное заселение',
  'legal.hasRedevelopment': 'Перепланировка', 'legal.hasMinorOwners': 'Несовершеннолетние собственники', 'legal.maternityCapitalUsed': 'Использован материнский капитал',
  'location.address': 'Адрес', 'extra': 'Комментарий об объекте',
};

const optionLabels: Record<string, string> = {
  sale: 'Продажа', rent: 'Длительная аренда', daily_rent: 'Посуточная аренда', flat: 'Квартира', room: 'Комната', house: 'Дом',
  free: 'Свободная продажа', alternative: 'Альтернатива', few_months: 'Несколько месяцев', long_term: 'Длительный срок',
  cosmetic: 'Косметический', design: 'Дизайнерский', euro: 'Евроремонт', no: 'Нет', separate: 'Изолированные', combined: 'Смежные', both: 'Изолированные и смежные',
  street: 'На улицу', yard: 'Во двор', yard_and_street: 'Во двор и на улицу', indoors: 'В доме', outdoors: 'На улице',
  block: 'Блочный', boards: 'Щитовой', brick: 'Кирпич', monolith: 'Монолит', monolith_brick: 'Монолит и кирпич', old: 'Старый фонд', panel: 'Панельный',
  stalin: 'Сталинский', wood: 'Дерево', wireframe: 'Каркасный', aerocrete_block: 'Газобетон', gas_silicate_block: 'Газосиликат', foam_concrete_block: 'Пенобетон',
  ground: 'Наземная', multilevel: 'Многоуровневая', roof: 'На крыше', underground: 'Подземная', open: 'Открытая',
  solid_wood: 'Брус', glued_laminated_timber: 'Клеёный брус', sip_panels: 'СИП-панели', reinforced_concrete_panels: 'Железобетонные панели',
  metal_frame: 'Металлокаркас', expanded_clay_concrete: 'Керамзитобетон', slag_concrete: 'Шлакобетон', arbolit: 'Арболит',
  ready: 'Готов к проживанию', interior_decoration_required: 'Нужна внутренняя отделка', unfinished: 'Не достроен', major_repairs_required: 'Нужен капитальный ремонт',
  fireplace: 'Камин', stove: 'Печь', central_gas: 'Центральное газовое', central_coal: 'Центральное угольное', electric: 'Электрическое',
  autonomous_gas: 'Автономное газовое', diesel: 'Дизельное', solid_fuel_boiler: 'Твердотопливный котёл',
  main: 'Магистральный', border: 'По границе участка', gas_holder: 'Газгольдер', gas_bottle: 'Баллонный',
  central: 'Центральное', borehole: 'Скважина', well: 'Колодец', septic_tank: 'Септик', cesspool: 'Выгребная яма',
  sotka: 'Сотки', hectare: 'Гектары', farm: 'Фермерское хозяйство', private_farm: 'Личное подсобное хозяйство', gardening: 'Садоводство',
  individual_housing_construction: 'ИЖС', suburban_non_profit_partnership: 'Дачное некоммерческое партнёрство', horticulture: 'Огородничество', other: 'Другое',
  for_agricultural_purposes: 'Сельскохозяйственные земли', settlements: 'Земли населённых пунктов',
  allowed: 'Разрешены', forbidden: 'Запрещены', designated_areas_only: 'Только в отведённых местах', by_agreement: 'По согласованию',
};

export const fieldOptions = (path: string) => (listingRules[path]!.enum ?? listingRules[path]!.items?.enum ?? [])
  .map((value) => ({ value, label: path === 'rules.smoking' && value === 'allowed' ? 'Разрешено'
    : path === 'rules.smoking' && value === 'forbidden' ? 'Запрещено'
      : path === 'house.drainageType' && value === 'central' ? 'Центральная' : optionLabels[value]! }));
export const fieldKey = (path: string) => path.replaceAll('.', '_');
