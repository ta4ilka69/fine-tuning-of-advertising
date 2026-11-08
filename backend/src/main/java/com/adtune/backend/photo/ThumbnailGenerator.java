package com.adtune.backend.photo;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;

/** Уменьшенная JPEG-копия для списков; оригинал не меняется. */
@Component
public class ThumbnailGenerator {

  private static final int MAX_SIDE = 640;

  public byte[] thumbnail(byte[] original) {
    try {
      BufferedImage image = ImageIO.read(new ByteArrayInputStream(original));
      if (image == null) {
        throw new IllegalArgumentException("Файл не является изображением");
      }
      double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(image.getWidth(), image.getHeight()));
      int width = Math.max(1, (int) Math.round(image.getWidth() * scale));
      int height = Math.max(1, (int) Math.round(image.getHeight() * scale));
      BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
      Graphics2D graphics = resized.createGraphics();
      try {
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
            RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(image, 0, 0, width, height, null);
      } finally {
        graphics.dispose();
      }
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      if (!ImageIO.write(resized, "jpeg", out)) {
        throw new IllegalStateException("JPEG-кодирование недоступно");
      }
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException("Не удалось обработать изображение", e);
    }
  }
}
