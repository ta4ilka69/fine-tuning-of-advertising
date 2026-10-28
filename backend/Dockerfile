FROM gradle:8.14.3-jdk21 AS build
WORKDIR /workspace
COPY gradle.properties settings.gradle.kts build.gradle.kts ./
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle --no-daemon dependencies --quiet > /dev/null 2>&1 || true
COPY src ./src
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle --no-daemon bootJar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /workspace/build/libs/*SNAPSHOT.jar app.jar
USER app
EXPOSE 8000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
