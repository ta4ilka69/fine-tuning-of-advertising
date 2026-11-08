package com.adtune.backend.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Пул для фоновых задач AI (генерации и анализ фото). */
@Configuration
public class AsyncConfig {

  public static final String AI_EXECUTOR = "aiExecutor";

  @Bean(name = AI_EXECUTOR, destroyMethod = "shutdown")
  public ExecutorService aiExecutor() {
    AtomicInteger counter = new AtomicInteger();
    return Executors.newFixedThreadPool(8, runnable -> {
      Thread thread = new Thread(runnable, "ai-task-" + counter.incrementAndGet());
      thread.setDaemon(true);
      return thread;
    });
  }
}
