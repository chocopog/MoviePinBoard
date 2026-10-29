# Movie Pinboard Product Requirements Document

**Status:** Current product baseline  
**Version:** 1.0  
**Last updated:** October 26, 2026  
**Product:** Movie Pinboard

## 1. Product summary

Movie Pinboard is a private, shared movie wishlist for two people. Each room provides two personal movie boards and a shared Watched board. People can add movie titles, notes, and posters; pin movies for either person; mark movies as watched; and preserve the room's history across sessions and devices.

The product combines a simple room-based collaboration model with a tactile cinema scrapbook aesthetic: paper textures, poster-like cards, ticket-style navigation, cinema reels, and high-contrast vintage typography.

## 2. Problem statement

Couples and close friends often save movie recommendations across chat messages, notes, and streaming watchlists. Those lists become fragmented, difficult to prioritize, and easy to lose.

Movie Pinboard should provide:

- One shared place to collect movie ideas.
- A clear distinction between who a movie is for and who added it.
- A lightweight way to track watched movies.
- A persistent room identity that does not disappear when a session expires or a device changes.
- A memorable, enjoyable visual experience rather than a generic task-management interface.

## 3. Goals and success criteria

### Product goals

1. Let two people create and access a private movie room without email accounts.
2. Make it easy to add, browse, organize, and complete movie recommendations.
3. Preserve room membership, names, pinups, and movie history across sign-outs and devices.
4. Support multiple rooms for the same person with quick room switching.
5. Deliver a polished, responsive paper-and-cinema visual identity.
6. Keep the product small, fast, and inexpensive to operate.

### Success criteria

- A new room can be created and used in under two minutes.
- An existing member can sign back in from a new device using the room name, password, and their existing name.
- A user can add a movie, see it on the intended board, mark it watched, and find it in Watched.
- A user with multiple rooms can switch rooms without re-authenticating.
- Room history remains available after logout, cookie expiry, or device replacement.
- The core layout is usable on mobile and desktop.
- Authentication and data isolation tests remain green.

## 4. Target users and personas

### Primary persona: Two-person movie partners

Two people want a shared list of films to watch together. They value low setup effort, privacy, a personal touch, and the ability to return to the same history over time.

### Secondary persona: Returning member on a new device

A person opens the app on a phone, laptop, or a device with cleared cookies. They need to recover their existing room identity without creating a duplicate person or losing prior movies.

### Secondary persona: Multi-room user

A person participates in more than one room, such as a partner room and a family or friends room. They need visible room navigation similar to a lightweight Discord server rail.

## 5. Product scope

### In scope

- Password-protected room creation and joining.
- Two permanent member identities per room.
- Sign out and sign back in.
- Multiple rooms per browser session.
- Room switching and a room sidebar.
- Movie title, note, recipient board, poster, and pinned state.
- Watched state and Watched board.
- Bulk movement of checked movies to Watched.
- Movie deletion.
- Polling-based synchronization while the page is open.
- Responsive vintage cinema/paper interface.
- Local development with PGlite and hosted deployment with Postgres/Neon.

### Out of scope

- Email accounts, social login, or password reset.
- More than two members per room.
- Movie metadata lookup, streaming availability, ratings, trailers, or automatic poster search.
- Direct messaging or comments.
- Notifications, email reminders, or push notifications.
- Public room discovery.
- Room deletion or a user-facing “leave room” action.
- Fine-grained per-movie permissions within a room.

## 6. Core concepts

### Room

A private collaboration space identified by a unique normalized name and protected by a password. A room has a maximum of two permanent members and contains all movie history for those members.

### Member

A named person identity associated permanently with one room and one slot (`a` or `b`). Membership is not removed when a user signs out or loses a browser session.

### Session

A signed, HttpOnly cookie valid for up to 90 days. It represents the current device's access and may contain multiple room memberships. Ending a session must not modify room or member records.

### Movie pinup

A movie record containing a title, optional note, optional compressed poster image, target member, author member, pinned state, checked state, watched state, and timestamps.

## 7. User journeys

### 7.1 Create a room

1. User opens Movie Pinboard.
2. User selects the create-room mode.
3. User enters room name, password, and their name.
4. System validates the inputs and creates the room.
5. System creates the first permanent member in slot A.
6. User enters the room and sees their empty board plus the prompt for the second person.

### 7.2 Join a room as the second member

1. User enters the room name, password, and a name.
2. System verifies the password.
3. System creates the second permanent member in slot B.
4. User enters the room and sees both boards.

### 7.3 Sign back in

1. User enters the existing room name, password, and the same member name used previously.
2. System matches the normalized name within that room.
3. System restores access to the existing member identity.
4. Existing movies, notes, poster images, and watched history are shown.
5. The system must not create a duplicate member.

### 7.4 Add and complete a movie

1. User opens the add-movie panel.
2. User enters a title and optional note.
3. User chooses the recipient board and optionally uploads a poster or pins the movie.
4. System stores the movie in the current room.
5. Either member can mark it watched or move checked movies to Watched.
6. The movie remains part of the room history until explicitly deleted.

### 7.5 Use multiple rooms

1. User creates or joins another room.
2. The room appears in the left room rail.
3. User selects a room to switch context.
4. The current room's members and movies are replaced with the selected room's state.
5. The user's memberships remain available in the session.

### 7.6 Sign out

1. User selects Sign out.
2. System clears the current device's session cookie.
3. Room membership, member name, movies, and history remain unchanged.
4. User can return by joining with the existing room credentials and name.

## 8. Functional requirements

### Authentication and room access

| ID | Requirement | Acceptance criteria |
|---|---|---|
| AUTH-01 | Create a room | Valid room name, password, and person name create a room and sign the creator in. |
| AUTH-02 | Validate room creation | Room names must have at least three normalized characters; passwords must be 6–72 characters; names are required. |
| AUTH-03 | Join a room | A valid password permits a new member when the room has fewer than two members. |
| AUTH-04 | Permanent membership | A member record is never removed by logout, session expiry, or normal UI actions. |
| AUTH-05 | Sign back in | Matching an existing member name in the correct room restores that member instead of creating a duplicate. |
| AUTH-06 | Protect credentials | Passwords are stored as bcrypt hashes and are never returned to the client. |
| AUTH-07 | Protect unknown rooms | Unknown rooms and wrong passwords return the same generic authentication error. |
| AUTH-08 | Brute-force protection | After eight incorrect password attempts, the room is locked for five minutes. |
| AUTH-09 | Sign out | Sign out clears the device cookie only and does not alter persistent room data. |
| AUTH-10 | Multiple memberships | A session can contain memberships for multiple rooms. |
| AUTH-11 | Switch rooms | A signed-in user can switch only to a room in their membership list. |
| AUTH-12 | Rename | A signed-in member can rename their member identity, subject to room uniqueness. |

### Movie management

| ID | Requirement | Acceptance criteria |
|---|---|---|
| MOV-01 | Add a movie | A signed-in member can add a title to either member's board. |
| MOV-02 | Add notes | A movie can include an optional note up to 300 characters. |
| MOV-03 | Add poster | Accepted JPEG, PNG, and WebP images are resized client-side and stored with a size limit. |
| MOV-04 | Pin movie | A movie can be marked pinned when created or updated. |
| MOV-05 | Check movie | A user can mark a movie as watched/checked on its board. |
| MOV-06 | Watched board | Watched movies appear in a shared Watched view, ordered by watched time. |
| MOV-07 | Bulk move | Checked movies can be moved to Watched together. |
| MOV-08 | Delete movie | A member can delete a movie from the current room. |
| MOV-09 | Room isolation | Members can only read, update, or delete movies in their current room. |
| MOV-10 | Room capacity | A room supports up to 500 movie records. |

### Interface and experience

| ID | Requirement | Acceptance criteria |
|---|---|---|
| UX-01 | Paper theme | The app uses a paper-texture background and coordinated cream, brown, burgundy, and ochre palette. |
| UX-02 | Cinema identity | The app uses the Rye display font with fallbacks, CSS cinema reels, and a cinema-reel favicon. |
| UX-03 | Contrast | Primary and secondary text remains readable against paper, dark header, cards, and empty states. |
| UX-04 | Responsive layout | Header, room rail, lobby, boards, controls, and movie grid adapt to narrow screens. |
| UX-05 | Room navigation | Joined rooms are visible in a persistent desktop sidebar and become an in-flow control on smaller screens. |
| UX-06 | Feedback | Save, error, upload, sign-in, and state-change actions provide visible feedback. |
| UX-07 | Reduced motion | Decorative reel animation is disabled when the user prefers reduced motion. |
| UX-08 | Accessibility basics | Interactive controls are keyboard reachable, focus-visible, labeled, and use semantic buttons/forms where applicable. |

## 9. Data and API requirements

### Data entities

- `rooms`: normalized slug, display name, bcrypt password hash, failed-attempt count, lock timestamp, creation timestamp.
- `members`: room ID, slot, unique normalized name per room, creation timestamp.
- `movies`: room ID, title, note, recipient slot, author slot, pinned/checked/watched flags, watched timestamp, optional image and image type, creation timestamp.

### API surface

- `POST /api/auth`
  - `create`
  - `join`
  - `rename`
  - `switch`
  - `logout`
- `GET /api/state`
- `POST /api/movies`
- `PATCH /api/movies?id=<uuid>`
- `DELETE /api/movies?id=<uuid>`
- `GET /api/img?id=<uuid>`

All protected endpoints require a valid session. API errors should be explicit, user-safe, and consistent with the existing status-code behavior.

## 10. Non-functional requirements

### Security

- Use HttpOnly, SameSite cookies for sessions.
- Use Secure cookies over HTTPS.
- Sign and verify session tokens with a server-side secret of at least 16 characters.
- Never expose password hashes or raw poster data in normal state responses.
- Enforce room ownership through server-side room/member checks, not client state.
- Keep unknown-room and wrong-password responses indistinguishable.
- Preserve rate limiting/lockout behavior for password guessing.

### Performance

- Initial room state should load in a single state request.
- Poster images should be compressed before upload.
- The UI should remain usable with up to 500 movies per room.
- Polling should occur every five seconds only while the page is visible and signed in.

### Reliability

- Room and member data must survive cookie expiration, logout, and device changes.
- A failed refresh must show an actionable error rather than silently presenting stale success state.
- Local development must work without a hosted database using PGlite.
- Hosted deployment must work with a Postgres-compatible database.

### Compatibility

- Node.js 20 or newer.
- Modern desktop and mobile browsers with JavaScript, localStorage, CSS gradients, and standard cookie support.

## 11. Current implementation baseline

The current project already provides:

- A single-page frontend in [public/index.html](./public/index.html).
- Serverless route handlers in [api/](./api/).
- Database initialization and access in [lib/db.js](./lib/db.js).
- Signed multi-room session cookies in [lib/auth.js](./lib/auth.js).
- Local and hosted database support.
- Paper background, poster cards, cinema reels, Rye typography, and responsive room navigation.
- Authentication and movie-management smoke coverage in [scripts/smoke.mjs](./scripts/smoke.mjs).

## 12. Quality assurance plan

### Automated checks

- Create-room success and secure cookie attributes.
- Duplicate room rejection.
- Input validation.
- Wrong-password and unknown-room behavior.
- Second-member join and third-member rejection.
- Existing-member sign-back-in behavior.
- Invalid-session rejection.
- Movie create/update/delete and room isolation.
- Multiple rooms and room switching.
- Rename uniqueness.
- Logout followed by sign-in with preserved membership and movie history.
- Password lockout.

### Manual checks

- Create a room on desktop and mobile.
- Join from a separate browser/device.
- Clear cookies and sign back in with the existing name.
- Add posters from supported and unsupported image formats.
- Verify readable text on all paper and dark surfaces.
- Switch between multiple rooms.
- Test keyboard navigation and reduced-motion settings.
- Verify that sign out does not remove room membership or movie history.

## 13. Future opportunities

These are not required for the current baseline but are natural follow-ups:

1. Optional invite links or QR codes that avoid typing room names.
2. A secure recovery mechanism that does not expose member identities.
3. Movie search and metadata enrichment through an external provider.
4. Filtering and sorting by pinned state, recipient, genre, or date.
5. Activity history for edits, watched changes, and deletions.
6. Export/import of a room's movie list.
7. Optional real-time updates instead of five-second polling.
8. Configurable themes while retaining the cinema identity.

## 14. Open product decisions

- Whether the two-person room limit should remain permanent or become configurable.
- Whether room passwords should be changeable by an existing member.
- Whether a recovery flow should be added without introducing email accounts.
- Whether deleted movies should be recoverable through an archive.
- Whether future rooms should support a display name separate from the authentication name.

