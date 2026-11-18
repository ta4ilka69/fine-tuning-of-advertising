package com.adtune.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ParamsHumanizerTest {

  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void humanizesFullListingDataWithoutMachineIdentifiers() throws Exception {
    var data = mapper.readTree("""
        {
          "deal": {
            "type": "rent", "price": 10000, "deposit": 35, "leaseTerm": "few_months",
            "prepayMonths": 3, "utilitiesPrice": 32532, "commissionPercent": 3,
            "metersNotIncluded": true, "utilitiesIncluded": true
          },
          "rules": {"petsAllowed": false, "childrenAllowed": true},
          "object": {
            "type": "flat", "floor": 12, "roomType": "separate", "totalArea": 2352,
            "isEuroFlat": false, "livingArea": 131, "repairType": "cosmetic",
            "roomsCount": 0, "isPenthouse": true, "kitchenArea": 23,
            "windowsView": "yard_and_street", "isApartments": true,
            "balconiesCount": 2, "separateWcsCount": 2
          },
          "building": {
            "buildYear": 2024, "floorsCount": 15, "parkingType": "multilevel",
            "hasConcierge": true, "ceilingHeight": 3.3, "hasBarrierYard": true,
            "cargoLiftsCount": 2, "hasCarFreeCourt": false, "hasGarbageChute": true,
            "passengerLiftsCount": 5
          },
          "location": {
            "address": "ul. Aleksandra Matrosova, 8, Saint Petersburg",
            "undergrounds": [{"name": "Купчино", "minutes": 14, "transportType": "walk"}]
          },
          "amenities": {
            "hasTv": true, "hasFridge": true, "hasShower": true, "hasWasher": true,
            "hasBathtub": true, "hasInternet": true, "hasFurniture": false,
            "hasDishwasher": true, "hasConditioner": true, "hasKitchenFurniture": false
          },
          "extra": "Тихий зелёный район."
        }
        """);

    String text = ParamsHumanizer.humanize(data);

    assertThat(text)
        .contains("Сделка: длительная аренда; цена 10000 ₽; залог 35 ₽")
        .contains("срок аренды — несколько месяцев")
        .contains("коммунальные платежи включены")
        .contains("коммунальные платежи 32532 ₽ в месяц")
        .contains("Объект: квартира; апартаменты; пентхаус; студия; "
            + "комнаты изолированные; общая площадь 2352 м²")
        .contains("этаж 12")
        .contains("окна выходят во двор и на улицу")
        .contains("косметический ремонт")
        .contains("Здание: этажей в здании — 15; год постройки здания 2024")
        .contains("парковка многоуровневая")
        .contains("высота потолков 3.3 м")
        .contains("Оснащение: есть — холодильник, стиральная машина, посудомоечная машина, "
            + "кондиционер, телевизор, интернет, ванна, душ; нет — мебель, мебель на кухне")
        .contains("Условия проживания: можно с детьми; с животными нельзя")
        .contains("Расположение: адрес — ul. Aleksandra Matrosova, 8, Saint Petersburg; "
            + "метро Купчино — 14 мин пешком")
        .contains("Комментарий об объекте: Тихий зелёный район.")
        .doesNotContain("roomType")
        .doesNotContain("hasFurniture")
        .doesNotContain("separate")
        .doesNotContain("few_months")
        .doesNotContain("utilitiesIncluded")
        .doesNotContain("multilevel")
        .doesNotContain("\"type\"");
  }

  @Test
  void emptyAndMissingDataProducePlaceholder() {
    assertThat(ParamsHumanizer.humanize(null))
        .isEqualTo("Параметры объекта не заполнены.");
    assertThat(ParamsHumanizer.humanize(mapper.createObjectNode()))
        .isEqualTo("Параметры объекта не заполнены.");
  }

  @Test
  void houseBlockIsHumanizedForHouseObject() throws Exception {
    var data = mapper.readTree("""
        {
          "object": {"type": "house", "totalArea": 120},
          "house": {
            "floorsCount": 2, "materialTypes": ["brick", "glued_laminated_timber"],
            "condition": "unfinished", "heatingType": "autonomous_gas",
            "landArea": 12, "landAreaUnit": "sotka",
            "landUseType": "individual_housing_construction"
          }
        }
        """);

    String text = ParamsHumanizer.humanize(data);

    assertThat(text)
        .contains("Объект: дом; общая площадь 120 м²")
        .contains("материалы дома — кирпич, клеёный брус")
        .contains("не достроен")
        .contains("отопление автономное газовое")
        .contains("площадь участка 12 соток")
        .contains("использование участка — ИЖС")
        .doesNotContain("glued_laminated_timber")
        .doesNotContain("autonomous_gas");
  }
}
