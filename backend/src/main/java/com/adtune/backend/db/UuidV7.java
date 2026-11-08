package com.adtune.backend.db;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.UUID;

/** Генератор UUID v7: сортируется по времени, как и DEFAULT uuidv7() в схеме. */
public final class UuidV7 {

  private static final SecureRandom RANDOM = new SecureRandom();

  private UuidV7() {
  }

  public static UUID generate() {
    byte[] value = new byte[16];
    RANDOM.nextBytes(value);
    long timestamp = System.currentTimeMillis();
    value[0] = (byte) (timestamp >>> 40);
    value[1] = (byte) (timestamp >>> 32);
    value[2] = (byte) (timestamp >>> 24);
    value[3] = (byte) (timestamp >>> 16);
    value[4] = (byte) (timestamp >>> 8);
    value[5] = (byte) timestamp;
    value[6] = (byte) ((value[6] & 0x0F) | 0x70); // версия 7
    value[8] = (byte) ((value[8] & 0x3F) | 0x80); // вариант RFC 4122
    ByteBuffer buffer = ByteBuffer.wrap(value);
    return new UUID(buffer.getLong(), buffer.getLong());
  }
}
