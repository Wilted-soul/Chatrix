# Developer features: setup

Everything is in `chatrix-home.html` (the "DEVELOPER MODULE" block at the bottom). No new files to host.

## 1. Firestore rules to add

Text/poll posts live in a new `posts` collection. Merge this into your rules:

```
match /posts/{postId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.text is string
    && request.resource.data.text.size() <= 1500;
  // likes, replies and poll votes only touch counters
  allow update: if request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['likesCount','commentsCount','votes','votesTotal']);
  allow delete: if request.auth != null && resource.data.ownerId == request.auth.uid;

  match /likes/{uid} {
    allow read: if request.auth != null;
    allow create, delete: if request.auth != null && request.auth.uid == uid;
  }
  // no update/delete rule, so a vote can't be changed
  match /votes/{uid} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow create: if request.auth != null && request.auth.uid == uid;
  }
  // replies: copy the rules you already use for videos/{id}/comments
  match /comments/{cid} { /* same as videos comments */ }
}
```

Your `users/{uid}` rule must let the owner write four new fields:
`building`, `links` (map: github, website, x), `collab` (bool), `lookingFor`.
If that rule uses `hasOnly([...])`, add them to the list.

No new index is needed (the tag page uses a single `array-contains` query on `posts.tags`).

## 2. What each feature does

| Feature | Where |
|---|---|
| Code snippets | Wrap code in triple backticks in posts, captions, comments and chats. Syntax colours and a Copy button. Single backticks give inline code. In chats use Shift+Enter for new lines. |
| Hashtags | `#react` becomes a link in posts, captions, statuses with photos, comments and chats, and opens a tag page. Explore shows trending tags. |
| Project links | Settings > Developer details: "Currently building", GitHub, website, X. Shown on your profile. |
| Find developers | Friends page: search, role, tech chips (match all) and an "Open to collaborate" switch. |
| Collaborator badge | Same Settings card. Badge shows on your profile and next to your name in people lists. |
| Text posts and polls | Home feed: "What are you building?" bar, `{ }` for a code post, "Poll" for 2 to 4 options that end in 1, 3 or 7 days. Posts can be liked, replied to, shared and deleted. |

## 3. Known limits

- Hashtags on **videos and statuses** are found from the text already loaded (latest 30 videos, active statuses). Posts are also queried from the server by tag.
- Deleting a post removes the post only. Its likes, votes and replies stay as orphaned documents; clean up with a Cloud Function later.
- Poll counts are updated from the client, like your existing like counters. Move them server-side when you add counter functions.
- Replies to posts don't send notifications yet.
