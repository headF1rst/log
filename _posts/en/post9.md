---
title: "Solving the Billion-Dollar Mistake: Modern Java Null Safety with JSpecify and NullAway"
date: "2025-09-24"
section: tech
tags: "Null Safety"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Ftotx4mdagz9nsegld5mr.png"
description: "Learn how to eliminate NullPointerExceptions using JSpecify annotations and NullAway static analysis in modern Java applications"
searchKeywords: "JSpecify, NullAway, Java null safety, NullPointerException prevention, static analysis"
translationSlug: "post10"
---

Whether you're a developer just starting with Java or a senior engineer with two decades of experience, the most frequently encountered error is undoubtedly the **NullPointerException**.

![Top Crash Reasons](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/v82uppsp39zvfkuuwr1m.png)

In fact, statistics show that NullPointerException is the second most common software defect, highlighting just how many developers struggle with NPEs.

[Tony Hoare](https://news.ycombinator.com/item?id=12427069) famously called it his "billion-dollar mistake."

> "I call it my billion-dollar mistake. It was the invention of the null reference in 1965. … This has led to innumerable errors, vulnerabilities, and system crashes, which have probably caused a billion dollars of pain and damage in the last forty years."

To improve null safety, various attempts have been made in the Java ecosystem. Following `Optional` and the `@NonNull` annotation from JSR 305, **JSpecify** has emerged as the modern standard.

This article will demonstrate how to use JSpecify to enhance your project's stability and why it's a low-overhead choice for new and existing systems alike.

## NullPointerException: Why Is It Still a Problem?

Consider this code, which calls an API to extract a token and uses the result without any null checks.

```java
// TokenExtractor.java
public interface TokenExtractor {
    String extractToken(String authorization);
}

// Main.java
TokenExtractor tokenExtractor = new DefaultTokenExtractor();
String token = tokenExtractor.extractToken("some-auth-header");
System.out.println("Token length: " + token.length()); // <-- NullPointerException!
```

This code will throw a `NullPointerException` if the `extractToken` method returns `null`. When it does, the token variable becomes null, and any attempt to access its members, like `token.length()`, triggers the exception.

The fundamental problem in Java is that nullability is **implicit**. Unless explicitly stated in API documentation, developers can't be sure whether a return value can be null, leading to misunderstandings and bugs.

## JSpecify: A Standard for Explicit Null Safety

To solve this problem, teams from Google, JetBrains, Spring, and others collaborated to create the JSpecify standard.

JSpecify is more than just a set of annotations; it provides a clear specification for null safety, ensuring consistent behavior across tools like IDEs and static analyzers.

JSpecify defines nullability in three states:
1. **Unspecified**: The default state in Java, where a value may or may not be null.
2. **Nullable (@Nullable)**: Explicitly indicates that a value can be null.
3. **Non-null (@NonNull)**: Guarantees that a value will never be null.

![JSpecify Null](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qp2g74jw6udz7f0x9nbf.png)

### Adding JSpecify Dependency

```gradle
implementation 'org.jspecify:jspecify:1.0.0'
```

Now, we can annotate the `TokenExtractor` interface to make its nullability explicit.

```java
import org.jspecify.annotations.Nullable;

public interface TokenExtractor {
  
    @Nullable // Specifies that the return value can be null
    String extractToken(String authorization);
}
```

With this change, an IDE like IntelliJ IDEA will warn you of a potential `NullPointerException` at the `token.length()` call, helping you fix the issue before it becomes a runtime error.

![IntelliJ IDE Null](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/i34w3oga4na12thlupwp.png)

## Improving Readability: Setting Defaults with `@NullMarked`

In most APIs (around 90% of the time), values are expected to be non-null. Adding `@NonNull` to every parameter and return type is tedious, clutters code, and harms readability.

To address this, JSpecify provides the `@NullMarked` annotation.

By applying `@NullMarked` at the package level (in a `package-info.java` file), all types within that package are considered non-null by default.

```java
// src/main/java/com/example/package-info.java
@NullMarked
package com.example;

import org.jspecify.annotations.NullMarked;
```

Now, everything is treated as non-null unless explicitly marked with `@Nullable`, resulting in much cleaner and more manageable code.

## Build-Time Verification: Strengthening Null Safety with NullAway

IDE warnings are helpful, but they can't prevent developers from committing code that ignores them.

To enforce null safety, you can use a static analysis tool like [NullAway](https://github.com/uber/NullAway). NullAway is an Error Prone plugin that analyzes JSpecify annotations during the build process and will cause the build to fail if it finds any null-safety violations.

You can configure it in Gradle as follows:

```gradle
plugins {
  id 'net.ltgt.errorprone' version '4.1.0'
}

dependencies {
    implementation 'org.jspecify:jspecify:1.0.0'
    
    errorprone "com.google.errorprone:error_prone_core:2.37.0"
    errorprone "com.uber.nullaway:nullaway:0.12.6"
}

tasks.withType(JavaCompile).configureEach {
    options.errorprone {
        disableAllChecks = true
        option("NullAway:OnlyNullMarked", "true")
        error("NullAway")
    }
}
```

If you ignore the IDE warning and run the build, it will fail with a compile-time error, preventing code that violates null safety from being deployed.

![build error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/k82l826lqbmlzs5rclpu.png)

## JSpecify in the Spring Ecosystem

Starting with Spring Framework 7 (included in Spring Boot 4), the entire codebase has been migrated to use JSpecify annotations. This means Spring developers can leverage null-safety information from Spring APIs directly in their IDEs and build tools without any additional setup.

For example, the `RestClient`'s `.body()` method returns a `@Nullable String`, reminding developers to handle the possibility of a `null` response appropriately.

```java
// Spring's RestClient API
@Nullable
String body = restClient.get().uri("/user").retrieve().body(String.class);

// The IDE warns that 'body' can be null, prompting a null check.
System.out.println(body.length());
```

## The Future of Null Safety in Java

In the long term, null-safety features are planned for the Java language itself as part of Project Valhalla.

New syntax like `String?` (nullable) and `String!` (non-null) has been proposed. However, due to Java's commitment to backward compatibility, the default for unannotated types will likely remain "unspecified". [(https://openjdk.org/jeps/8303099)](https://openjdk.org/jeps/8303099)

Since this feature is still in the proposal stage and will likely take several years to materialize, JSpecify and NullAway currently represent the most practical and powerful way to improve the stability of Java applications.

## Conclusion

JSpecify and NullAway are a powerful combination for addressing Java's "billion-dollar mistake." By using explicit annotations, you clarify your code's intent and can eliminate potential NullPointerExceptions at compile time through IDE and build tool integration.

Based on my experience introducing JSpecify to my team, I've seen firsthand how a simple configuration can significantly improve application stability and code quality. A major advantage is the ability to adopt it gradually on a package-by-package basis, which makes applying it to existing projects far less daunting.

I encourage you to try JSpecify in your projects and start writing safer, more robust Java code today.
