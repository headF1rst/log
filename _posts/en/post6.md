---
title: "From Theory to Practice: A JMH Showdown Between Sequential and Parallel Streams"
date: "2025-06-15"
section: tech
tags: "Java, JMH"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F7ytq239pcfe279t9avzg.png"
description: "Practical performance comparison between sequential and parallel streams using JMH benchmarking"
searchKeywords: "JMH benchmark, Java performance, sequential vs parallel, stream optimization"
---

In our [previous post](https://dev.to/headf1rst/discover-how-forkjoinpool-powers-javas-high-performance-parallel-processing-3pn7), we delved into the mechanics of ForkJoinPool, the powerful engine behind Java's parallel processing capabilities. Theory is essential, but seeing the real-world impact is what truly matters. Now, it's time to put that theory to the test.

This post presents a practical performance comparison between traditional sequential processing and parallel processing using `parallelStream`. We'll use the **Java Microbenchmark Harness (JMH)** to precisely measure the performance gains achieved when validating a large set of data (transportation plans in our example).

## The Benchmark: Setting the Stage

This section covers all the details required to understand how the test was designed, configured, and implemented.

### Test Environment and JMH Configuration

To ensure a fair and reliable comparison, we established a controlled test environment using JMH. The objective is to measure the average execution time of the `TransportPlanExcelUploadValidator`'s validation logic.

- **Test Data**: A list containing 1,000 to 10,000 transport plan entries.
- **Benchmark Tool**: JMH (Java Microbenchmark Harness).
- **Warmup Iterations**: 5 rounds to allow the JVM to perform initial optimizations.
- **Measurement Iterations**: 10 rounds to capture a stable average execution time.
- **Forks**: 1 fork to run the test in a separate process, ensuring isolation.

It's important to briefly discuss why the **warmup iterations** are critical for accurate results on the JVM. When Java code is first run, the JVM may interpret it or use a baseline compiler. Only after code has been executed multiple times (making it "hot"), does the Just-In-Time (JIT) compiler step in to perform significant optimizations, translating bytecode into highly efficient native code. The warmup phase ensures that this JIT compilation and other optimizations have completed, so that our measurements reflect the true performance of the optimized code, not the initial, slower startup phase.

### The Benchmark Code

The core of our benchmark lies in the `TransportPlanExcelUploadValidatorBenchmark` class. We've defined two separate methods, each annotated with `@Benchmark`, to measure the performance of the sequential and parallel approaches.

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MILLISECONDS)
@State(Scope.Benchmark)
public class TransportPlanExcelUploadValidatorBenchmark {

    private ParallelValidator parallelValidator;
    private SequentialValidator sequentialValidator;

    private LocalDate transportDate;
    private List<TransportPlanExcelUploadInfo> uploadPlans;
    private Set<TransportPlan> registeredPlans;
    private Map<String, Route> routes;

    @Setup
    public void setup() {
        // Prepare test data
        ManagerService managerService = mock(ManagerService.class);
        parallelValidator = new ParallelValidator(managerService);
        sequentialValidator = new SequentialValidator(managerService);

        // Setup Fixtures...

        // Mock manager service methods
        given(managerService.findAllByFullCarNumberAndUsableIsTrue(anySet()))
                .willReturn(Collections.emptyList());

        // Generate test data
        uploadPlans = IntStream.range(0, 1_000)
                .mapToObj(i -> {
                    DawnMiddleMileTransportPlanInfo info = new DawnMiddleMileTransportPlanInfo();
                    info.setTransportDate(transportDate);
                    info.setDeparture("Test Departure");
                    info.setDestination("Test Destination");
                    info.setExpectedEntryTime(String.format("%02d:00", (i % 24)));
                    info.setCarNumber("12가" + (3000 + i));
                    info.setDeliveryRound(1);
                    info.setRowNumber(i + 1);
                    return info;
                })
                .collect(Collectors.toList());
    }

    @Benchmark
    public void sequentialValidation(Blackhole blackhole) {
        var result = sequentialValidator.validateExcelUpload(transportDate, uploadPlans, registeredPlans, routes);
        blackhole.consume(result);
    }

    @Benchmark
    public void parallelValidation(Blackhole blackhole) {
        var result = parallelValidator.validateExcelUpload(transportDate, uploadPlans, registeredPlans, routes);
        blackhole.consume(result);
    }
}
```

### Implementation: Sequential vs. Parallel Validators

Here is a brief look at the two different validator implementations being tested. The core difference lies in how they iterate over the data and collect results.

The `SequentialValidator` uses a standard `for` loop. It iterates through the list of plans one by one, validates each item in a single thread, and adds the results directly to standard `ArrayLists`. This represents a traditional, single-threaded approach.

The `ParallelValidator`, in contrast, leverages `parallelStream().forEach()` to process the plans concurrently. To safely collect results from multiple threads without causing race conditions, it uses thread-safe `ConcurrentLinkedQueue` collections. Once the parallel processing is complete, these queues are drained into `ArrayLists` to form the final result.

#### ParallelValidator.java

```java
@Service
@RequiredArgsConstructor
public class ParallelValidator {

    private final ManagerService managerService;

    public TransportPlanUploadValidationResult validateExcelUpload(...) {
        // ...
        ConcurrentLinkedQueue<TransportPlanExcelUploadInfo> validInfosQueue = new ConcurrentLinkedQueue<>();
        ConcurrentLinkedQueue<ValidationFailure> failuresQueue = new ConcurrentLinkedQueue<>();

        sortedUploadPlans.parallelStream().forEach(uploadPlan -> {
            List<String> failedReasons = validateExcelUploadRow(uploadPlan, validationContext);

            if (failedReasons.isEmpty()) {
                validInfosQueue.add(uploadPlan);
            } else {
                failuresQueue.add(ValidationFailure.of(uploadPlan.getRowNumber(), failedReasons));
            }
        });

        List<TransportPlanExcelUploadInfo> validInfos = new ArrayList<>(validInfosQueue);
        List<ValidationFailure> failures = new ArrayList<>(failuresQueue);

        return TransportPlanUploadValidationResult.of(validInfos, failures);
    }
    // ...
}
```

#### SequentialValidator.java

```java
@Service
@RequiredArgsConstructor
public class SequentialValidator {

    private final ManagerService managerService;

    public TransportPlanUploadValidationResult validateExcelUpload(...) {
        List<TransportPlanExcelUploadInfo> validInfos = new ArrayList<>();
        List<ValidationFailure> failures = new ArrayList<>();
        // ...
        for (TransportPlanExcelUploadInfo uploadPlan : sortedUploadPlans) {
            List<String> failedReasons = validateExcelUploadRow(uploadPlan, validationContext);

            if (!failedReasons.isEmpty()) {
                failures.add(ValidationFailure.of(uploadPlan.getRowNumber(), failedReasons));
            } else {
                validInfos.add(uploadPlan);
            }
        }

        return TransportPlanUploadValidationResult.of(validInfos, failures);
    }
    // ...
}
```

## Running the Benchmark

The benchmark was executed using the following main class, which configures and runs the JMH Runner.

```java
public class RunBenchmark {

    public static void main(String[] args) throws RunnerException {

        Options accurateOptions = new OptionsBuilder()
                .include(TransportPlanExcelUploadValidatorBenchmark.class.getSimpleName())
                .forks(1)  // Use 1 JVM forks
                .warmupIterations(5)  // 5 warmup iterations
                .warmupTime(TimeValue.seconds(1))  // 1 seconds per warmup iteration
                .measurementIterations(10)
                .measurementTime(TimeValue.seconds(2))  // 2 seconds per measurement iteration
                .resultFormat(ResultFormatType.JSON)
                .result("jmh-results.json")
                .build();

        int availableProcessors = Runtime.getRuntime().availableProcessors();
        System.out.println("Benchmark started: Sequential vs Parallel processing performance comparison");
        System.out.println("Data size: 1,000 transport plans");
        System.out.println("Available processors (cores): " + availableProcessors);
        System.out.println("---------------------------------------------");

        new Runner(accurateOptions).run();
    }
}
```

## The Results: Quantifying the Performance Gain

Now, let's examine the findings from our benchmark tests.

### Case 1: A 1,000-Item Dataset

![JMH Benchmark Result](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1knf86i6r6wpjdcwetnd.png)

First, let's look at the results for a dataset of 1,000 items. The `parallelValidation` benchmark scored **6.392 ms/op**, while `sequentialValidation` came in at **20.359 ms/op**.

![JMH Benchmark Result Comp](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/iplv0k3c8bbolw75lyow.png)

This translates to a **68.60%** performance improvement, a significant gain even for a moderately sized dataset.

### Case 2: A 10,000-Item Dataset

![JMH Benchmark Result](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vklyrxhsw9uleaulo444.png)

When we increased the load to 10,000 items, the advantage of parallel processing became even more stark. The parallel version clocked in at **321.574 ms/op** compared to the sequential version's **1917.098 ms/op**. The performance improvement jumped to an impressive **83.23%**. This demonstrates that the benefits of `parallelStream` become more pronounced as the data volume grows and the initial thread management overhead becomes less significant relative to the total work.

![JMH Benchmark Result Comp](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/iy8u1ndqxv49iommydw9.png)

## Visualizing the Results

To make the results easier to interpret, the output JSON from JMH can be uploaded to the [JMH Visualizer](https://jmh.morethan.io/). This free tool generates clear charts that compare the performance scores, making it easy to see the difference at a glance.

![JMH Visualizer](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/n0ku0mzifrr3g4o74mnf.png)

## Conclusion

Before applying parallelStream across your application, always consider the following:

- **Parallelism is Not a Silver Bullet**. Unconditional parallel processing is not always better. For small datasets or very simple tasks, the overhead costs can lead to performance degradation. You must consider if the cost of task splitting, merging, and Fork/Join scheduling is more expensive than the actual operation (like a simple string comparison).

- **Benchmarking is Essential**. The success in this scenario does not guarantee success in others. The only way to know for sure if a change yields a performance benefit is to test it in a controlled environment.

This leads to the most critical takeaway: **Measure, Don't Assume**. While theory provides a strong foundation, only empirical data from a benchmark can confirm whether a change is a true optimization for your specific use case.
