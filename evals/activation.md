# Activation

The description is the only thing an agent sees before it loads a skill.
These prompts check that each skill loads when it should and stays out
when it should not. Run each prompt in a fresh session with all three
skills installed. Record which skill, if any, the agent loads first.

**Rubric**

- Every "loads" row loads the named skill before the agent writes code or
  calls an API.
- Every "no skill" row loads none of the three.
- A near-miss row never loads the wrong SignatureAPI skill.

| Prompt | Expected |
| --- | --- |
| Add e-signatures to our invoicing app so clients sign the engagement letter. | architecture |
| Build me something like DocuSign for our landlords. | architecture |
| How should our HR tool collect signatures on offer letters? | architecture |
| We already have the design doc. Implement the SignatureAPI signing flow. | integrate |
| Add a second signer to the SignatureAPI envelope we create in `quotes.ts`. | integrate |
| Handle the SignatureAPI `envelope.completed` webhook and store the PDF. | integrate |
| Send me one test envelope with this PDF so I can see the signing page. | integrate |
| Our SignatureAPI envelope has been stuck in processing for an hour. | diagnose |
| The client says they never got the signing email. | diagnose |
| We stopped receiving SignatureAPI webhooks yesterday. | diagnose |
| Our Stripe webhook handler returns 400 on every event. | no skill |
| Add a DocuSign envelope to the onboarding flow; we use DocuSign. | no skill |
| Generate a PDF invoice with pdfkit. | no skill |
| Draw a signature pad component in React for our own profile page. | no skill |
