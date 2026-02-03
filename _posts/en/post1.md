---
title: "Kafka Producer Stability Check: Ensuring Message Safety in Apache Kafka"
section: tech
date: "2025-05-04"
tags: "Kafka, Producer, Reliability, Apache Kafka"
thumbnail: "https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ojt2w7s7rr9kws35r2yg.png"
description: "Learn how to build fault-tolerant Kafka producers that survive rolling patches and broker failures"
searchKeywords: "Kafka, producer, reliability, message safety, rolling patch, broker failure"
---

During a recent incident, our team observed message loss from a Kafka producer during an Amazon MSK rolling patch. What began as a routine upgrade quickly uncovered hidden weaknesses in our producer's configuration.

As we dug into the issue, I developed a clearer picture of how Kafka producers interact with broker leaders and what it truly takes to build a production-grade, fault-tolerant producer pipeline. This post captures those insights—covering critical configuration options that influence message delivery reliability and mechanisms behind them.

Let's begin by examining how message loss can occur during a rolling patch—and then broaden our lens to explore other scenarios where Kafka messages might be at risk.

## A Successful Scenario: How Rolling Patches Should Work

Amazon MSK performs "rolling patches" to apply updates while minimizing disruption by restarting brokers one at a time.

In a well-configured environment, the patching process follows a series of fault-tolerant steps that ensure message delivery remains uninterrupted:

**1. Initial State**:

   * All brokers (1, 2, and 3) are operational.
   * Partition 1 has its leader on Broker 1, and its ISR (In-Sync Replicas) includes {Broker 1, 2, 3}.
   * The producer is configured for high resilience, using settings such as a high `retries` count, `acks=all`, and `enable.idempotence=true`.

![kafka cluster setting](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/8gb5ff7le7bqsma2ufk7.png)

**2. Patch Initiation (Target: Broker 1)**:

   * MSK initiates a controlled shutdown of Broker 1.
   * The Kafka controller detects the shutdown and reassigns leadership of Partition 1 to another ISR member, such as Broker 2.
   * This metadata change is propagated throughout the cluster.

![kafka cluster](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/634g8uf9aklhre2o55lq.png)

**3. Producer's Initial Reaction**:

   * The producer may still believe Broker 1 is the leader.
   * Send attempts to Broker 1 fail, triggering connection errors or `NotLeaderOrFollowerException`.

**4. Metadata Refresh and Retry Logic**:

   * The producer, equipped with a high retry count, continues retrying.
   * These failures trigger a metadata refresh (either reactively or via `metadata.max.age.ms`).
   * The producer receives updated metadata indicating Broker 2 as the new leader and updates its internal routing.

![metadata](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ckjr45rpuli7cf5lb2k8.png)

**5. Successful Message Delivery**:

   * The message is retried and sent to Broker 2.
   * Broker 2 persists the message locally and replicates it to Broker 3 (Broker 1 is offline).
   * With acknowledgments from all in-sync replicas (2 and 3), and `min.insync.replicas=2` satisfied, Broker 2 responds with a final ACK.

![ISR](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/vx16uutcmelb9dcm1lny.png)

As a result, the message is successfully delivered, even though the original leader was taken offline. Kafka's failover mechanism, combined with a resilient producer configuration, ensures no data is lost.

---

However, in our case, the `retries` setting was limited to 5 (Kafka versions before 2.1 defaulted to 0), and `retry.backoff.ms` was set to its default value of 100ms. This left less than a second of total retry time.

Leader re-election and metadata propagation didn't complete within that narrow window. As a result, the producer exhausted all retry attempts before it became aware of the new leader.

Eventually, the producer gave up. If the application doesn't explicitly handle this failure—such as routing to a Dead Letter Queue—the message is lost.

Despite the presence of other brokers, the producer failed to reach the correct leader within its constrained retry window, resulting in irreversible message loss.

---

## Why Leader Re-Election Isn't Instant

When a partition leader becomes unavailable—such as during a rolling patch—Kafka initiates a leader re-election process to maintain availability and consistency. This process is coordinated by a special broker known as the **Controller**.

To understand this process, it's important to first review the roles brokers play in replication. Kafka topics are divided into partitions, and each partition is replicated across multiple brokers. Among these, one broker is elected as the **Leader**, responsible for all read and write operations for that partition. All producers and consumers interact solely with the leader. The other brokers serve as **Followers**, replicating data from the leader to remain synchronized.

### The Role of Controller Broker

The Controller Broker functions as the cluster's brain. It monitors broker health (via ZooKeeper or KRaft), detects failures, and orchestrates the leader re-election process. Importantly, the controller itself is designed to be highly available.

Here's how the re-election process typically unfolds:

1. **Failure Detection**: The controller notices the leader is unresponsive, usually via missed heartbeats or expired sessions.

2. **Partition Identification**: It identifies all partitions for which the failed broker was the leader.

3. **ISR Consultation**: For each affected partition, it consults the ISR (In-Sync Replica) list to determine which followers are fully up to date.

4. **Safe Leader Assignment**: A new leader is selected from the ISR (assuming `unclean.leader.election.enable=false`), ensuring no data loss.

5. **Metadata Update**: The controller records the leadership change in the cluster's metadata (ZooKeeper or KRaft).

6. **Cluster-Wide Propagation**: The new metadata is broadcast to all brokers.

7. **Client Refresh**: Kafka clients (like producers) either detect errors like `NotLeaderOrFollowerException` or refresh metadata after the `metadata.max.age.ms` interval. This enables them to learn the identity of the new leader and resume operations.

### The Timing Challenge

Each step introduces some delay. In practice, the full process—from detecting failure to clients updating their metadata—can take several seconds to tens of seconds, depending on cluster size, network conditions, and whether you're running ZooKeeper or KRaft.

This delay is precisely the danger window: if the producer exhausts its retries before learning about the new leader, the message will be lost.

Understanding this timing is critical to configuring your producer appropriately—and is exactly what our team learned the hard way.

---

## Building a Resilient Kafka Producer: Key Configurations

A resilient Kafka producer doesn't happen by accident—it's the result of carefully chosen configuration settings that account for real-world failure scenarios like broker downtime and leader re-elections.

Below are the key settings that significantly improve the producer's reliability:

### `acks=all`

This setting ensures that the leader broker waits for acknowledgment from all in-sync replicas (ISRs) before responding to the producer. It offers the highest level of durability.

* **Benefit**: Protects against data loss if the leader fails after writing but before replication.
* **Risk without it**: With `acks=1`, the leader acknowledges after writing locally. If it fails before replication, the message is lost.

### `retries=Integer.MAX_VALUE`

Allows the producer to retry failed sends indefinitely (bounded by `delivery.timeout.ms`). Starting with Kafka 2.1, this is the **default** value.

* **Benefit**: Handles transient failures like leader unavailability or network hiccups.

* **Risk without it**: Limited retries can exhaust before leader re-election or metadata refresh completes. (bounded by `delivery.timeout.ms`).

### `enable.idempotence=true`

Prevents duplicate message delivery when retries occur, while also preserving message order within a single partition.

* **How it works**: When idempotence is enabled, each Kafka producer is assigned a unique **Producer ID (PID)**. For every partition the producer writes to, it attaches a **monotonically increasing sequence number** to each message. Brokers track the last successfully written sequence number for each PID/partition pair.

  If the broker receives a message with a sequence number it has already seen—or one that is out of order—it treats it as a duplicate and silently discards it.

* **Guaranteeing Order**: Idempotent producers also preserve message ordering per partition. This is especially critical during retries. To safely maintain this ordering, Kafka enforces that `max.in.flight.requests.per.connection` must be set to **5 or fewer**. Higher values may cause out-of-order retries, which Kafka cannot deduplicate reliably.

* **Requirements**:

  * `acks=all` must be enabled to ensure replication safety.
  * `retries` must be greater than 0 to allow resending.
  * `max.in.flight.requests.per.connection` must be ≤ 5 to keep idempotence active.

By meeting these conditions, Kafka ensures **exactly-once semantics per partition** within a single producer session—without sacrificing performance or message integrity.

This mechanism is crucial for mission-critical systems, where even a single duplicate or out-of-order event could lead to inconsistent downstream state.

* **How it works**: Assigns sequence numbers to messages and uses producer IDs to detect and discard duplicates.
* **Requirement**: Must be used with `acks=all` and `retries>0`.

### Additional Settings to Consider

* `max.in.flight.requests.per.connection<=5`: Controls how many messages can be sent to a broker without receiving acknowledgments.

  When `enable.idempotence=true`, Kafka requires this value to be **≤ 5** to ensure safe deduplication. If it's higher, Kafka disables idempotence to avoid state management complexity.

* `request.timeout.ms`: Time the producer waits for a response from the broker. Should generally be less than or equal to `delivery.timeout.ms`.

By tuning these configurations appropriately, your producer becomes resilient to transient errors, rolling patches, and even brief leader outages—dramatically reducing the risk of message loss.

## When Retries Aren't Enough: Why You Still Need a DLQ

Even with idempotence enabled and retries set to the maximum, Kafka producers can still encounter unrecoverable failures. Scenarios like extended broker outages, prolonged network partitions, message serialization errors, or misconfigurations (e.g., messages exceeding size limits) can cause final send failures.

That's where a **Dead Letter Queue (DLQ)** comes in.

### What Is a DLQ?

A Dead Letter Queue is a secondary Kafka topic or external system where messages are routed after repeated delivery attempts have failed.

### Why You Still Need a DLQ

* **Transient vs. Terminal Failures**: Kafka's retry mechanisms handle transient failures. DLQs catch terminal ones.
* **Delivery Timeout**: Even with `retries=Integer.MAX_VALUE`, Kafka producers ultimately give up if `delivery.timeout.ms` is exceeded.
* **Non-Retriable Errors**: Errors like schema validation failure, record size violations, or authentication issues won't be fixed by retrying.
* **Observability**: DLQs give teams visibility into failed messages for postmortem analysis or manual replay.

### DLQ Design Best Practices

1. **Use a Separate Kafka Topic**: Isolate failed messages in a clearly named topic (e.g., `my-topic.DLQ`).
2. **Include Contextual Metadata**: Such as error reason, original topic and partition, timestamp, and message key.
3. **Avoid Blocking Main Flow**: Ensure DLQ writes are async or decoupled so they don't slow down the main processing path.
4. **Secure and Monitor**: Apply appropriate ACLs and set up alerting/monitoring on DLQ volume.

Implementing a DLQ is a pragmatic and necessary layer of protection. It ensures that when all else fails, your data doesn't disappear silently—and your team has the tooling needed to recover from unexpected edge cases.

---

## Testing Your Configuration: Simulating Failure Scenarios

Reading documentation and tuning configurations is only part of the equation—validating your Kafka producer setup through failure simulations is essential to ensure true resilience.

Here's a step-by-step guide to stress-testing your producer under real-world conditions:

### 1. **Spin Up a Test Cluster**

Set up a local Kafka cluster with at least three brokers using Docker Compose or test infrastructure.

* Ensure replication factor = 3 and `min.insync.replicas = 2` for target topics.

### 2. **Configure Your Producer**

Prepare two configurations:

* **Baseline**: Low retries, no idempotence (e.g., `retries=3`, `acks=1`).
* **Resilient**: Recommended settings (`acks=all`, `retries=Integer.MAX_VALUE`, `enable.idempotence=true`, appropriate backoff and timeouts).

### 3. **Simulate Rolling Broker Restart**

While actively producing messages:

* Restart one broker at a time to mimic a rolling patch.
* Introduce controlled shutdown and observe producer logs.

### 4. **Observe and Compare**

* Do messages get lost or duplicated?
* Do retries behave as expected?
* Are DLQ fallbacks triggered for unrecoverable failures?

By rigorously testing your Kafka setup under adverse conditions, you can verify that your configuration not only looks good on paper—but actually holds up under stress. This ensures peace of mind in production environments where message loss is not an option.

---

## Conclusion: Owning Message Reliability End-to-End

Kafka's durability guarantees are strong, but not infallible. Without a properly configured producer, even a routine rolling patch can lead to silent message loss—something no team wants to discover after the fact.

Through this real-world failure and recovery, we learned that ensuring message safety is a shared responsibility between Kafka and the application. It requires more than just enabling replication—it demands careful attention to producer configuration, retry behavior, idempotence, DLQ design, and validation through controlled failure testing.

By:

* Setting `acks=all`
* Enabling idempotence
* Maximizing retries with meaningful backoff
* Using DLQs for unrecoverable cases

—you can confidently build systems that survive the unexpected.

Message safety isn't a default. It's a design choice. And with the right choices, Kafka becomes not just fast and scalable, but truly reliable.
