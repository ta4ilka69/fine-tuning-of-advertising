package com.adtune.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Переводит машинное представление данных объявления (JSON с английскими
 * ключами и значениями енумов) в человекочитаемый список по-русски — в таком
 * виде данные уходят модели, чтобы она не тащила идентификаторы в текст.
 * Названия полей и вариантов выровнены со словарём фронтенда
 * (frontend/src/features/listing-form/fields.ts); неизвестные поля
 * не перечисляются.
 */
public final class ParamsHumanizer {

  private ParamsHumanizer() {
  }

  public static String humanize(JsonNode data) {
    if (data == null || !data.isObject() || data.isEmpty()) {
      return "Параметры объекта не заполнены.";
    }
    List<String> lines = new ArrayList<>();
    deal(data.path("deal"), lines);
    object(data.path("object"), lines);
    building(data.path("building"), lines);
    house(data.path("house"), lines);
    amenities(data.path("amenities"), lines);
    rules(data.path("rules"), lines);
    legal(data.path("legal"), lines);
    location(data.path("location"), lines);
    String extra = data.path("extra").asText("");
    if (!extra.isBlank()) {
      lines.add("Комментарий об объекте: " + extra.trim());
    }
    if (lines.isEmpty()) {
      return "Параметры объекта не заполнены.";
    }
    return String.join("\n", lines);
  }

  private static void deal(JsonNode deal, List<String> lines) {
    if (!deal.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addEnum(parts, Map.of(
        "sale", "продажа",
        "rent", "длительная аренда",
        "daily_rent", "посуточная аренда"), deal.path("type").asText(null), null);
    addNumber(parts, "цена %s ₽", deal.path("price"));
    addEnum(parts, Map.of(
        "free", "свободная продажа",
        "alternative", "альтернатива"), deal.path("saleType").asText(null), null);
    addBool(parts, deal.path("mortgageAllowed"), "возможна ипотека", "ипотека невозможна");
    addNumber(parts, "залог %s ₽", deal.path("deposit"));
    addNumber(parts, "комиссия %s %%", deal.path("commissionPercent"));
    addNumber(parts, "предоплата за %s мес.", deal.path("prepayMonths"));
    addEnum(parts, Map.of(
        "few_months", "срок аренды — несколько месяцев",
        "long_term", "срок аренды — длительный"), deal.path("leaseTerm").asText(null), null);
    addBool(parts, deal.path("utilitiesIncluded"),
        "коммунальные платежи включены", "коммунальные платежи не включены");
    addNumber(parts, "коммунальные платежи %s ₽ в месяц", deal.path("utilitiesPrice"));
    addBool(parts, deal.path("metersNotIncluded"),
        "счётчики оплачиваются отдельно", null);
    addSection(lines, "Сделка", parts);
  }

  private static void object(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addEnum(parts, Map.of(
        "flat", "квартира",
        "room", "комната",
        "house", "дом"), node.path("type").asText(null), null);
    addBool(parts, node.path("isApartments"), "апартаменты", null);
    addBool(parts, node.path("isPenthouse"), "пентхаус", null);
    addBool(parts, node.path("isEuroFlat"), "европланировка", null);
    if (node.has("roomsCount") && node.path("roomsCount").isNumber()) {
      int rooms = node.path("roomsCount").asInt();
      parts.add(rooms == 0 ? "студия" : "комнат — " + rooms);
    }
    addEnum(parts, Map.of(
        "separate", "комнаты изолированные",
        "combined", "комнаты смежные",
        "both", "комнаты изолированные и смежные"), node.path("roomType").asText(null), null);
    addNumber(parts, "общая площадь %s м²", node.path("totalArea"));
    addNumber(parts, "жилая площадь %s м²", node.path("livingArea"));
    addNumber(parts, "площадь кухни %s м²", node.path("kitchenArea"));
    addNumber(parts, "этаж %s", node.path("floor"));
    addNumber(parts, "балконов — %s", node.path("balconiesCount"));
    addNumber(parts, "лоджий — %s", node.path("loggiasCount"));
    addEnum(parts, Map.of(
        "street", "окна выходят на улицу",
        "yard", "окна выходят во двор",
        "yard_and_street", "окна выходят во двор и на улицу"), node.path("windowsView").asText(null), null);
    addNumber(parts, "раздельных санузлов — %s", node.path("separateWcsCount"));
    addNumber(parts, "совмещённых санузлов — %s", node.path("combinedWcsCount"));
    addNumber(parts, "спален — %s", node.path("bedroomsCount"));
    addNumber(parts, "санузлов — %s", node.path("wcsCount"));
    addEnum(parts, Map.of(
        "indoors", "санузел в доме",
        "outdoors", "санузел на улице"), node.path("wcLocation").asText(null), null);
    addEnum(parts, Map.of(
        "cosmetic", "косметический ремонт",
        "design", "дизайнерский ремонт",
        "euro", "евроремонт",
        "no", "без ремонта"), node.path("repairType").asText(null), null);
    addSection(lines, "Объект", parts);
  }

  private static void building(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addNumber(parts, "этажей в здании — %s", node.path("floorsCount"));
    addNumber(parts, "год постройки здания %s", node.path("buildYear"));
    addEnum(parts, materialNames(), node.path("materialType").asText(null), "материал здания — %s");
    addNumber(parts, "высота потолков %s м", node.path("ceilingHeight"));
    addNumber(parts, "пассажирских лифтов — %s", node.path("passengerLiftsCount"));
    addNumber(parts, "грузовых лифтов — %s", node.path("cargoLiftsCount"));
    addBool(parts, node.path("hasGarbageChute"), "мусоропровод", "мусоропровода нет");
    addEnum(parts, Map.of(
        "ground", "парковка наземная",
        "multilevel", "парковка многоуровневая",
        "roof", "парковка на крыше",
        "underground", "парковка подземная",
        "open", "парковка открытая"), node.path("parkingType").asText(null), null);
    addBool(parts, node.path("hasBarrierYard"), "закрытый двор", "двор не закрыт");
    addBool(parts, node.path("hasCarFreeCourt"), "двор без машин", "двор не закрыт для машин");
    addBool(parts, node.path("hasConcierge"), "консьерж", "консьержа нет");
    addSection(lines, "Здание", parts);
  }

  private static void house(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addNumber(parts, "этажей в доме — %s", node.path("floorsCount"));
    addNumber(parts, "год постройки дома %s", node.path("buildYear"));
    addBool(parts, node.path("isDacha"), "дача", null);
    JsonNode materials = node.path("materialTypes");
    if (materials.isArray() && !materials.isEmpty()) {
      List<String> names = new ArrayList<>();
      for (JsonNode material : materials) {
        String name = materialNames().get(material.asText());
        if (name != null) {
          names.add(name);
        }
      }
      if (!names.isEmpty()) {
        parts.add("материалы дома — " + String.join(", ", names));
      }
    }
    addEnum(parts, Map.of(
        "ready", "готов к проживанию",
        "interior_decoration_required", "нужна внутренняя отделка",
        "unfinished", "не достроен",
        "major_repairs_required", "нужен капитальный ремонт"), node.path("condition").asText(null), null);
    addEnum(parts, Map.of(
        "fireplace", "отопление — камин",
        "no", "отопления нет",
        "stove", "отопление — печь",
        "central_gas", "отопление центральное газовое",
        "central_coal", "отопление центральное угольное",
        "electric", "отопление электрическое",
        "autonomous_gas", "отопление автономное газовое",
        "diesel", "отопление дизельное",
        "solid_fuel_boiler", "отопление — твердотопливный котёл"), node.path("heatingType").asText(null), null);
    addEnum(parts, Map.of(
        "main", "газ магистральный",
        "border", "газ по границе участка",
        "gas_holder", "газгольдер",
        "gas_bottle", "газ баллонный"), node.path("gasType").asText(null), null);
    addEnum(parts, Map.of(
        "central", "водоснабжение центральное",
        "borehole", "водоснабжение из скважины",
        "well", "водоснабжение из колодца"), node.path("waterType").asText(null), null);
    addEnum(parts, Map.of(
        "central", "канализация центральная",
        "septic_tank", "канализация — септик",
        "cesspool", "канализация — выгребная яма"), node.path("drainageType").asText(null), null);
    addBool(parts, node.path("hasElectricity"), "электричество есть", "электричества нет");
    addBool(parts, node.path("hasTerrace"), "терраса", null);
    addBool(parts, node.path("hasCellar"), "погреб", null);
    addBool(parts, node.path("hasBathhouse"), "баня", null);
    addBool(parts, node.path("hasGarage"), "гараж", null);
    addBool(parts, node.path("hasPool"), "бассейн", null);
    addBool(parts, node.path("hasSecurity"), "охрана", null);
    JsonNode landArea = node.path("landArea");
    if (landArea.isNumber()) {
      String unit = "hectare".equals(node.path("landAreaUnit").asText(null)) ? "га" : "соток";
      parts.add("площадь участка " + landArea.asText() + " " + unit);
    }
    addEnum(parts, Map.of(
        "farm", "использование участка — фермерское хозяйство",
        "private_farm", "использование участка — личное подсобное хозяйство",
        "gardening", "использование участка — садоводство",
        "individual_housing_construction", "использование участка — ИЖС",
        "suburban_non_profit_partnership", "дачное некоммерческое партнёрство",
        "horticulture", "использование участка — огородничество",
        "other", "использование участка — другое"), node.path("landUseType").asText(null), null);
    addEnum(parts, Map.of(
        "for_agricultural_purposes", "сельскохозяйственные земли",
        "settlements", "земли населённых пунктов",
        "other", "категория земель — другая"), node.path("landCategory").asText(null), null);
    addSection(lines, "Дом и участок", parts);
  }

  private static void amenities(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    String[][] labels = {
        {"hasFurniture", "мебель"},
        {"hasKitchenFurniture", "мебель на кухне"},
        {"hasFridge", "холодильник"},
        {"hasWasher", "стиральная машина"},
        {"hasDishwasher", "посудомоечная машина"},
        {"hasConditioner", "кондиционер"},
        {"hasTv", "телевизор"},
        {"hasInternet", "интернет"},
        {"hasBathtub", "ванна"},
        {"hasShower", "душ"},
    };
    List<String> yes = new ArrayList<>();
    List<String> no = new ArrayList<>();
    for (String[] label : labels) {
      JsonNode value = node.path(label[0]);
      if (value.isBoolean()) {
        (value.asBoolean() ? yes : no).add(label[1]);
      }
    }
    List<String> parts = new ArrayList<>();
    if (!yes.isEmpty()) {
      parts.add("есть — " + String.join(", ", yes));
    }
    if (!no.isEmpty()) {
      parts.add("нет — " + String.join(", ", no));
    }
    addSection(lines, "Оснащение", parts);
  }

  private static void rules(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addBool(parts, node.path("childrenAllowed"), "можно с детьми", "с детьми нельзя");
    addBool(parts, node.path("petsAllowed"), "можно с животными", "с животными нельзя");
    addNumber(parts, "спальных мест — %s", node.path("bedsCount"));
    addNumber(parts, "гостей — %s", node.path("guestsCount"));
    addText(parts, "заезд с %s", node.path("checkInTime"));
    addText(parts, "выезд до %s", node.path("checkOutTime"));
    addEnum(parts, Map.of(
        "allowed", "курение разрешено",
        "forbidden", "курение запрещено",
        "designated_areas_only", "курение только в отведённых местах"), node.path("smoking").asText(null), null);
    addEnum(parts, Map.of(
        "allowed", "вечеринки разрешены",
        "forbidden", "вечеринки запрещены",
        "by_agreement", "вечеринки по согласованию"), node.path("parties").asText(null), null);
    addBool(parts, node.path("contactlessCheckin"), "бесконтактное заселение", null);
    addSection(lines, "Условия проживания", parts);
  }

  private static void legal(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    addBool(parts, node.path("hasRedevelopment"), "перепланировка есть", "перепланировки нет");
    addBool(parts, node.path("hasMinorOwners"), "несовершеннолетние собственники есть", null);
    addBool(parts, node.path("maternityCapitalUsed"), "материнский капитал использован", null);
    addSection(lines, "Юридические особенности", parts);
  }

  private static void location(JsonNode node, List<String> lines) {
    if (!node.isObject()) {
      return;
    }
    List<String> parts = new ArrayList<>();
    String address = node.path("address").asText("");
    if (!address.isBlank()) {
      parts.add("адрес — " + address.trim());
    }
    JsonNode undergrounds = node.path("undergrounds");
    if (undergrounds.isArray()) {
      for (JsonNode underground : undergrounds) {
        String name = underground.path("name").asText("");
        if (name.isBlank()) {
          continue;
        }
        JsonNode minutes = underground.path("minutes");
        String way = "transport".equals(underground.path("transportType").asText(null))
            ? "на транспорте" : "пешком";
        parts.add(minutes.isNumber()
            ? "метро " + name.trim() + " — " + minutes.asInt() + " мин " + way
            : "метро рядом — " + name.trim());
      }
    }
    addSection(lines, "Расположение", parts);
  }

  private static Map<String, String> materialNames() {
    return Map.ofEntries(
        Map.entry("block", "блочный"),
        Map.entry("boards", "щитовой"),
        Map.entry("brick", "кирпич"),
        Map.entry("monolith", "монолит"),
        Map.entry("monolith_brick", "монолит и кирпич"),
        Map.entry("old", "старый фонд"),
        Map.entry("panel", "панельный"),
        Map.entry("stalin", "сталинский"),
        Map.entry("wood", "дерево"),
        Map.entry("wireframe", "каркасный"),
        Map.entry("aerocrete_block", "газобетон"),
        Map.entry("gas_silicate_block", "газосиликат"),
        Map.entry("foam_concrete_block", "пенобетон"),
        Map.entry("solid_wood", "брус"),
        Map.entry("glued_laminated_timber", "клеёный брус"),
        Map.entry("sip_panels", "СИП-панели"),
        Map.entry("reinforced_concrete_panels", "железобетонные панели"),
        Map.entry("metal_frame", "металлокаркас"),
        Map.entry("expanded_clay_concrete", "керамзитобетон"),
        Map.entry("slag_concrete", "шлакобетон"),
        Map.entry("arbolit", "арболит"));
  }

  private static void addSection(List<String> lines, String title, List<String> parts) {
    if (!parts.isEmpty()) {
      lines.add(title + ": " + String.join("; ", parts) + ".");
    }
  }

  private static void addNumber(List<String> parts, String pattern, JsonNode value) {
    if (value.isNumber()) {
      parts.add(pattern.formatted(value.asText()));
    }
  }

  private static void addText(List<String> parts, String pattern, JsonNode value) {
    String text = value.asText("");
    if (!text.isBlank()) {
      parts.add(pattern.formatted(text.trim()));
    }
  }

  private static void addBool(List<String> parts, JsonNode value, String ifTrue, String ifFalse) {
    if (value.isBoolean()) {
      String phrase = value.asBoolean() ? ifTrue : ifFalse;
      if (phrase != null) {
        parts.add(phrase);
      }
    }
  }

  private static void addEnum(List<String> parts, Map<String, String> names, String value, String pattern) {
    if (value == null) {
      return;
    }
    String name = names.get(value);
    if (name != null) {
      parts.add(pattern == null ? name : pattern.formatted(name));
    }
  }
}
