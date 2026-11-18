package com.adtune.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class DefaultSystemPromptBuilderTest {

  private final DefaultSystemPromptBuilder builder = new DefaultSystemPromptBuilder();
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void systemPromptContainsCoreRules() {
    String prompt = builder.buildSystemPrompt();
    assertThat(prompt)
        .contains("маркетолог по недвижимости")
        .contains("придумывай: не упоминай")
        .contains("английские слова и машинные значения")
        .contains("0–100")
        .contains("не менее трёх причин")
        .contains("how_to_improve")
        .contains("photo_id")
        .contains("title_limit");
  }

  @Test
  void userPromptHumanizesParamsAndKeepsChannelsAndUserAddition() throws Exception {
    var params = mapper.readTree("""
        {"deal": {"type": "sale", "price": 14500000}, "object": {"roomsCount": 2}}
        """);
    AdGenerationRequest request = new AdGenerationRequest(
        params,
        List.of(new PhotoAiInput("5", "Гостиная")),
        List.of(new ChannelAiInput("avito", "Авито", "Деловой стиль.", List.of("Указана цена"), 50, null)),
        "Подчеркни тишину двора.");

    String prompt = builder.buildUserPrompt(request);

    assertThat(prompt)
        .contains("Параметры объекта:")
        .contains("Сделка: продажа; цена 14500000 ₽")
        .contains("комнат — 2")
        .contains("\"photo_id\" : \"5\"")
        .contains("\"channel_id\" : \"avito\"")
        .contains("\"title_limit\" : 50")
        .contains("Деловой стиль.")
        .contains("Дополнительные указания агента")
        .contains("Подчеркни тишину двора.")
        .doesNotContain("\"price\"")
        .doesNotContain("\"roomsCount\"")
        .doesNotContain("\"type\" : \"sale\"");
  }

  @Test
  void userPromptOmitsEmptyAddition() throws Exception {
    AdGenerationRequest request = new AdGenerationRequest(
        mapper.readTree("{\"object\": {\"roomsCount\": 1}}"), List.of(), List.of(), null);

    assertThat(builder.buildUserPrompt(request))
        .doesNotContain("Дополнительные указания агента")
        .contains("Площадки");
  }
}
