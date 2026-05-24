# MechTrack Inventory

MechTrack is a free field-test web app for managing machine parts inventory.

## Current Cloud Version

The deployable cloud app is:

- `field.html`
- `field-app.js`
- `styles.css`
- `supabase-config.js`
- `vercel.json`

It uses Supabase for:

- user login
- admin and standard roles
- machine sections
- parts inventory
- preset locations
- serial number lookup
- stock movement history

Photos are intentionally paused until OCR scanning is useful for serial numbers, part names, and quantities.

## Deploy To Vercel

1. In Vercel, choose **Add New Project**.
2. Import this GitHub repository.
3. Deploy.
4. Open the Vercel URL.

The included `vercel.json` routes the root URL to `field.html`.

## First User

The first account created in the app becomes the admin.

Admin users can:

- add machines
- add parts
- adjust stock
- manage user roles

Standard users can:

- view inventory
- search machines and parts
- look up serial numbers

## Supabase Project

This app is connected to Supabase project:

```text
https://fzyxmqzisngwtgepgiqt.supabase.co
```
