---
title: "Prompt Engineering Tips from Anthropic Engineers"
date: "2025-06-24"
section: tech
tags: "Prompt Engineering, AI, Anthropic, LLM"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fdzzrfth8zqdnrhbj9538.png"
description: "Valuable prompt engineering tips and insights from Anthropic engineers"
searchKeywords: "prompt engineering, AI tips, Anthropic, LLM best practices"
translationSlug: "post22"
---

Here are a few impressive points from [youtube (AI prompt engineering: A deep dive)](https://www.youtube.com/watch?v=T9aRN5JkmL8&t=2463s) where Anthropic engineers shared their prompt writing tips and experiences.

## Impressive Prompt Writing Tips

* When the model makes a mistake, it can be helpful to ask why it was wrong and directly ask the model how to instruct it next time to avoid the mistake.
* When the model faces unexpected input or ambiguous situations, you should provide clear instructions on what to do (e.g., output an "UNCERTAIN" tag) to prevent it from giving a wrong answer.
* Inducing the model to explain its reasoning process before providing an answer (Chain of Thought) improves the model's accuracy.
* You can ask the model to "interview" you. When it's difficult to clearly grasp what you want, you can get help constructing a prompt by asking the model to ask you questions and elicit the necessary information.

## Tips for Improving Prompt Engineering Skills

* **Read many other people's prompts and model outputs:** You can learn a lot by looking at great prompts, analyzing their structure and intent, and by carefully observing the model's outputs.
* **Attempt many conversations with the model:** You need to practice improving prompts by directly and repeatedly communicating with the model.
* **Show your prompts to others:** Showing a prompt you've written to someone without prior knowledge of the task can help you discover parts that are not clear.
* **Test the model's limits:** Trying to do the most difficult tasks you think the model cannot do and exploring its limits leads to the greatest learning.
