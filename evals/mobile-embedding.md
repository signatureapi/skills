# Mobile embedding

Two native apps that show the signing page inside the app. Run each
scenario against the Ledgerly fixture as the backend. The user names no
SignatureAPI term. A fresh agent with the skills should build the same
design on both platforms without being told.

The design gate stops the first turn with questions. Resume the run once
with this reply, using `ios/` or `android/` as the folder, then score the
built code and the final message:

> Answers: clients sign in to the app with a bearer token. Assume an
> existing `requireClient` middleware that sets `req.client` (id, email,
> name). Put the app code in an `ios/` folder in this repo. A new
> migration is fine. Do not set up an API key and skip any live test.
> Write the code and a UI test. Go ahead with your design.

## iOS SwiftUI app

**Prompt**

> Our clients use the Ledgerly iPhone app, built with SwiftUI. When a
> client taps "Sign engagement letter", I want them to sign inside the app
> and see our own thank-you screen afterwards. Add it.

**Rubric**

- The Ledgerly server creates the signing session. The app calls only the
  Ledgerly server and holds no SignatureAPI key.
- The server creates the signer with custom authentication, so the API
  returns the link and sends no email.
- The app loads the returned link as the top-level page of a `WKWebView`.
- The link carries `embedded=true` and `event_delivery=redirect`.
- Sets no `redirect_url` on the ceremony.
- Sets no `embeddable_in` on the ceremony.
- Sets `redirect_delay` to 0 on the server, not as a URL parameter.
- Catches the result in `webView(_:decidePolicyFor:decisionHandler:)`,
  cancels the navigation, and reads the event name from the URL host.
- Does not use `URLProtocol` or a proxy to catch the result.
- Handles the completed, canceled, declined and failed events. Decides
  failure handling from `error_type` only, never from `error_message`, and
  shows no `error_message` to the signer.
- Confirms the signature on the server, by reading the envelope or from a
  webhook, before it shows the thank-you screen as final.
- Does not store the link on the device and does not log it.
- Changes no cookie, `localStorage` or website data settings.
- Adds a UI test that signs through the ceremony with real touches or
  swipes, not JavaScript clicks. It asserts on the app's result screen,
  which only the delivered event triggers. Does not confirm the "Confirm
  to continue" dialog.
- Links the iOS page in the docs: `https://signatureapi.com/docs/embedded/ios`.

## Android Kotlin app

**Prompt**

> Our clients use the Ledgerly Android app. It is Kotlin with a normal
> Activity, not Compose. Clients should sign the engagement letter inside
> the app, and after that we show our own confirmation screen. It should
> survive a phone rotation. Add it.

**Rubric**

- The Ledgerly server creates the signing session, with custom
  authentication. The app holds no SignatureAPI key.
- The app loads the returned link as the top-level page of a `WebView`.
- The link carries `embedded=true` and `event_delivery=redirect`.
- Sets no `redirect_url` and no `embeddable_in` on the ceremony.
- Sets `redirect_delay` to 0 on the server, not as a URL parameter.
- Catches the result in `WebViewClient.shouldOverrideUrlLoading`, returns
  true to cancel the navigation, and reads the event name from the URL host.
- Does not use `shouldInterceptRequest` or a proxy to catch the result.
- Handles the completed, canceled, declined and failed events. Decides
  failure handling from `error_type` only, never from `error_message`, and
  shows no `error_message` to the signer.
- Confirms the signature on the server before it treats the result as final.
- Does not store the link on the device and does not log it.
- Handles rotation without recreating the `WebView`: declares
  `configChanges` for orientation and screen size in the manifest.
- Turns on JavaScript and adds no cookie or DOM storage settings.
- Adds a UI test that signs through the ceremony with real gestures, not
  `webClick()` from JavaScript. It asserts on the app's result screen,
  which only the delivered event triggers. Does not confirm the "Confirm
  to continue" dialog.
- Links the Android page in the docs:
  `https://signatureapi.com/docs/embedded/android`.
