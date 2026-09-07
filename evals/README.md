# Fresh-context scenarios

The unit tests check structure, identifiers and wording. They cannot check
whether a fresh agent behaves the way the skills say. These scenarios do.
Run them before publishing a change to `signatureapi-architecture` or the
design gate in `signatureapi-integrate`.

## How to run one

1. Copy `evals/fixture/` to a scratch directory outside this repo and `git init` it.
   It is a small invoicing app with the signals the architecture skill greps
   for: a PDF generator, an S3 client, a tenant table, a Stripe id column, a
   Stripe webhook route, a job queue, and an ADR directory.
2. Install the skills from your working copy, so the run sees the candidate
   content and nothing else:

       npx -y skills@latest add <path to this repo> --agent claude-code -y

3. Run the scenario's prompt with a headless agent from inside the scratch
   directory, and save the transcript:

       printf '%s' "<prompt>" | claude -p --model sonnet --max-turns 25 \
         --permission-mode acceptEdits --output-format json > out.json

   Pipe the prompt on stdin, exactly as shown, and do not wrap the command
   in `env`: with the prompt as an argument and an empty stdin, or under
   `env`, the headless run exits 0 with no output. A headless session also
   inherits the account's claude.ai connectors; a SignatureAPI connector
   there acts in the account's mode. Exclude it in a REST-only run, and
   check the transcript for the exact tool prefix it uses, since the
   prefix differs from a project `.mcp.json` server. A headless run cannot
   answer questions, so each scenario judges the agent's first message. `claude -p --resume <session id>` continues a run
   with the answers when a scenario has a second turn.
4. Score the transcript against the scenario's rubric. Every line must pass.
   Record the date, the model and the result in the pull request, not here.

## Scenarios

| File | Behaviour under test |
| --- | --- |
| `experience-first.md` | Asks about the journey before the API; small grouped questions |
| `vocabulary-and-hybrid.md` | Keeps the user's words; a hybrid flow is not forced into one shape |
| `quick-path.md` | Honors a request for one recommended design |
| `design-gate.md` | "Build me a DocuSign" produces a design conversation, not code |
| `novice-end-to-end.md` | A user who knows no SignatureAPI term reaches a working test integration |

## Other hosts

The skills ship to Codex and ChatGPT too. Before publishing a change to the
conversation rules, run at least experience-first, vocabulary-and-hybrid
and novice-end-to-end with Codex as well:

    npx -y skills@latest add <path to this repo> --agent codex -y
    codex exec --full-auto "<prompt>" > out.txt

Continue a Codex run with `codex exec resume --last "<answer>"`. Score the
same rubrics. A host without a shell or a filesystem (ChatGPT) cannot run
the scripts; the integrate skill's Know your host section says what the
agent does there, and the novice scenario is the one to try by hand in
that host.
