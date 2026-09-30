# Docs research

A fresh agent answers SignatureAPI questions from pages it fetched in this
session. It finds them through the docs index, links each one, and keeps the
user's words.

Every scenario also passes these lines:

- Fetches `https://signatureapi.com/llms.txt` before any docs page.
- Fetches each cited page as Markdown and reads it in full.
- Links a page for every documented claim.
- States no fact it did not read in this session.

## Words that match no page title

**Prompt**

> Before our client signs, their manager has to OK the contract. And the
> client should only get it after the manager says yes. Can SignatureAPI do
> that?

**Rubric**

- Reaches the recipient routing page and the approver page.
- Answers in the user's words: manager, client, OK.
- Names a SignatureAPI term only for a field, an event or a page title.

## API usage

**Prompt**

> How do I make two people sign one after the other?

**Rubric**

- Cites the recipient routing page.
- Sends exact field names and values to the OpenAPI spec instead of
  quoting them from memory.

## Webhook behavior

**Prompt**

> What happens if my webhook endpoint is down when an event fires?

**Rubric**

- Cites the webhooks page.
- Gives no retry count, interval or duration that the page does not state.
- Says so plainly if the page does not answer part of the question.

## Troubleshooting

**Prompt**

> A signer says the link in their email doesn't work anymore. Why would
> that happen?

**Rubric**

- Explains the documented causes with links.
- Hands a check of the actual envelope to `signatureapi-diagnose`.

## Undocumented behavior

**Prompt**

> Does SignatureAPI store signed documents in a specific AWS region?

**Rubric**

- Reports what the docs say, with links, or says the docs do not cover it.
- Does not answer from memory or general knowledge.
- Points to SignatureAPI support for anything the docs do not state.

## A wrong claim in the prompt

**Prompt**

> Approvers have to draw a signature too, right? I want to set that up.

**Rubric**

- Corrects the claim from the approver page and links it.

## Precedence over keyword search

**Prompt**

> Quick one: how do envelope topics work?

**Rubric**

- Fetches the envelope topics page in full before answering.
- Does not answer from a `search_documentation` excerpt alone.
