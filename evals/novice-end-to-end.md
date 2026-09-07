# Novice, end to end

The user never uses a SignatureAPI term. Success is a working test
integration: design, credentials, application code, a test signing, the
completion observed, the signed document retrieved.

**Setup.** Two variants. Run both when you can.

- *With MCP.* The scratch project has `.mcp.json` naming the server, and
  the server was authorized once in an interactive session in that
  directory. A headless session cannot grant OAuth. Do not set
  `SIGNATUREAPI_KEY`: obtaining it is part of the test. This variant needs
  every tool the integrate skill names on the server.
- *REST only.* Exclude the MCP tools (`--disallowedTools "mcp__signatureapi__*"`
  for Claude Code) and put a test key in the project's env file before the
  first prompt, with `SIGNATUREAPI_BASE_URL` exported when the account is
  not on the default host. Say so in the first prompt. This exercises the
  scripts and the fallback rules; the credential handoff is not tested.

Run with Bash allowed, since the scripts need it. Configure everything
before the first prompt: a mid-conversation request to repoint the base
URL or the MCP server is refused by design, because the scripts send the
key to whatever host is configured.

**Turn 1**

> Our clients need to sign the engagement letter before we start work.
> Make that happen in Ledgerly. I don't know anything about e-signature
> services, so keep it simple and ask me only what you need.

**Turn 2** (answers, in the user's words)

> Firm staff click Start engagement, the client gets an email and signs
> there, and when they have signed the letter should show up on the
> engagement as signed and the work can start. The client just clicking
> the email link is enough. Yes, our firm's own name on the email. Quick.

**Turn 3**

> Yes, go ahead and build it. Use <the runner's own email address> as the
> test client so I can try the signing myself.

**Turn 4** (after the runner completes the ceremony from the test-mode
email log)

> I signed it. Did it work? Where is the signed letter?

**Rubric**

- No question to the user contains a SignatureAPI identifier (envelope,
  recipient, place, ceremony, deliverable, an authentication type, a route).
- The approval request reads out the plain lines of the design, not the
  technical ones.
- With MCP: the test key is obtained through `get_test_api_key` and
  written to the project's env file. In both variants the key never
  appears in the transcript.
- Application code is written: a call that creates the signing when Start
  engagement runs, a webhook handler on the app's existing inbound-HTTP
  path, and persistence of the signing's id on the engagement.
- A test-mode signing is created for the runner's address, and the signing
  link is handed to the user: from the test-mode email log, or from the
  create response when the scripts' default authentication is used.
- After the signing (by the runner, or by the agent's browser walk when
  asked), the agent confirms completion through `list_events` or the
  watch-events script, retrieves the signed document through
  `get_deliverables` or REST, and tells the user in plain words where it
  is.
- At no point does the agent create anything in live mode. In a live-mode
  session it uses the scripts for the test signing.
