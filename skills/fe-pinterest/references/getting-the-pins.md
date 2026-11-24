# Getting the pins

Three ways, in the order to try them. All three end with image files in a folder on this machine, outside the repo or in a folder git ignores.

## 1. The user saves them (works today)

- Phone: open the board, screenshot it as you scroll (four or five screenshots cover about thirty pins), or open each pin and use Download image.
- Computer: open each pin, right-click the image, Save image.
- Put them in one folder, for example `~/boards/warm-studio/`. Whole-board screenshots work, but single pins give a cleaner palette because the white gaps between pins are not counted.

Then run `palette.mjs` on the folder.

## 2. The user's own boards through the official API (not scripted here)

Pinterest's API v5 lists the pins on boards the signed-in account owns or is a collaborator on. It needs a registered app and an access token from the user's own account.

```text
GET https://api.pinterest.com/v5/boards
GET https://api.pinterest.com/v5/boards/{board_id}/pins
```

Reference: https://developers.pinterest.com/docs/api/v5/ and https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/BoardsApi.md

This skill ships no script for it: it has not been run against a real account, and a token is a secret that does not belong in a prompt or a repo. If the user has an app and a token, they can download the images themselves into a folder and route 1 takes over.

## 3. Somebody else's board

Ask the user to save the pins they like from it (route 1). That is a person choosing what inspires them.

## Not allowed

- A script, a headless browser or a browser automation that opens pinterest.com and collects pins. Pinterest's terms forbid collecting content by automated means without its permission: https://policy.pinterest.com/en-gb/terms-of-service
- The undocumented `.rss` address of a board. It is not a supported interface.
- Committing pin images. They belong to the people who made them. `palette.json` records file names, never the files.
