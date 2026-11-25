# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (installable as a PWA), plus an Android APK that wraps the same web app.

## Stack

Delegated: Vite multi-page site (static landing HTML, React for the app and the Control Room), Three.js for the 3D crayon scenes, Supabase for accounts, the song queue and live updates, Vercel for static hosting and two small functions (song search, cover proxy). The fetching runs on two machines the owner already has: a Linux PC (systemd user service) and an Android phone (Termux), each running the Python worker beside the existing pipeline.

## Users

- **The owner.** Runs SheroFetch on their own PC and phone. Fetches songs into their own music folders and checks both machines from the Control Room (desktop app and /control).
- **Invited friends** (about 20 to 30, each with an invite code from the owner). Ask Shero for a song or a playlist from a phone or laptop, then play it in the browser or download it.

## Product Purpose

You name a song, or paste a Spotify or YouTube playlist link. Whichever of the owner's machines is awake takes it, finds the right version (Soulseek first, then YouTube), tags it, adds cover art and synced lyrics, and hands it back to play or download. Success means the right song arrives in the format asked for, even while the PC is off.

## Positioning

A song fetcher that runs on two personal machines instead of a server farm, shared by invite only, with an original crayon pup named Shero doing the fetching.

## Voice

English for menus, labels and errors. Shero himself talks in Hinglish: "Shero, gaana le aa!" on the fetch button, "Mil gaya!" when a song is ready.

## Constraints

- Invite only. No open sign-up; the owner hands out and revokes codes.
- Visual Aesthetic & Homage: Authentic 1990s Kasukabe manga architectural and character homage (procedurally generated low-poly 3D in Three.js with custom hand-drawn crayon shaders, celebrating Yoshito Usui's classic style). Procedural models faithfully capture the iconic residence (tatami room, chabudai table, Chocobi snack box, Action Kamen CRT TV, Shiro doghouse with food bowl, engawa veranda, buri-buri boogie, and watagashi animations).
- Formats are described honestly: FLAC is lossless only when Soulseek finds a real lossless file; otherwise it is converted from YouTube audio.
- Either machine can be asleep or offline; the interface says so plainly instead of hiding it.
- Anonymity: no personal identifiers anywhere in the site, the code or the commits. The public handle is meet-the-1337.
- Licence: AGPL-3.0.
