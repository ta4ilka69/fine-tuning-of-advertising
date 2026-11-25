package com.adtune.backend.photo;

import static org.assertj.core.api.Assertions.assertThat;

import com.adtune.backend.ai.PhotoAnalysisClient.PhotoAnalysis.Improvement;
import com.adtune.backend.db.PhotoImprovement;
import java.util.List;
import org.junit.jupiter.api.Test;

class PhotoImprovementSelectionTest {

  @Test
  void picksOnlyApplicableImprovement() {
    var selected = PhotoService.firstApplicable(List.of(
        new Improvement("clutter", false, null)));

    assertThat(selected).isNull();
  }

  @Test
  void picksInstructionOfApplicableType() {
    var selected = PhotoService.firstApplicable(List.of(
        new Improvement("clutter", true, "Убрать мусор у правого края кадра")));

    assertThat(selected).isNotNull();
    assertThat(selected.type()).isEqualTo(PhotoImprovement.clutter);
    assertThat(selected.instruction()).isEqualTo("Убрать мусор у правого края кадра");
  }

  @Test
  void skipsUnknownCodesAndBlankInstructions() {
    assertThat(PhotoService.firstApplicable(List.of(
        new Improvement("person_removal", true, "Убрать человека"),
        new Improvement("clutter", true, "   ")))).isNull();
  }

  @Test
  void nullListMeansNoImprovement() {
    assertThat(PhotoService.firstApplicable(null)).isNull();
    assertThat(PhotoService.firstApplicable(List.of())).isNull();
  }
}
