# RA_ColorMarkGames DX

This is a fork of the userscript [RA_ColorMarkGames](https://retroachievements.org/viewtopic.php?t=12821) by Xymjak for [Retroachievements](https://retroachievements.org/) web site.
It's meant to be used with [Tampermonkey](https://www.tampermonkey.net/) extension, mostly tested with Firefox, but it should work on other browsers and might work with other user script extensions like Greasmonkey and Violentmonkey, wihtout guarantee.

## New features

The script is fixed for RAWeb 6.0.3 (at least), and adds some features:
- UI on the settings page for the parameters at the beginning of the script: colors for the different categories, sorting order, small set threshold, show progress for 100% unlocks
- Adds an option to use hardcore progression instead of softcore to determine which games are half done or complete
- Possibility to have an empty sort order (no sort)
- Support for developer sets list
- Settings to disable coloring or sorting on pages with progress bars
- Support for other users progress page (and setting to disable it)
- On pages with progress bars, use data from these instead instead of the one stored from profile page
- and a few minor tweaks (script favicon, adds total unlocks in game list foot row...)

## Examples

*Similar Games* section on a game's page:

![Example - similar games](/assets/Example_game.png)

Hub page:

![Example - hub](/assets/Example_hub.png)

Developer's sets list:

![Example - dev sets](/assets/Example_dev_sets.png)

*Want to Play* list:

![Example - want to play](/assets/Example_wanttoplay.png)

Other user's *Completion Progress* page:

![Example - completion progress](/assets/Example_progress.png)

Forum post:

![Example - forum post](/assets/Example_forum.png)

## Settings

Settings can be changed on the user settings page, and are saved in the script extension's (Tampermonkey for example) storage. They are not synchronized between browsers or devices, but should be kept even if the website cache and storage are wiped.

![Settings default](/assets/Settings_default.png)

### Text colors

![Settings colors](/assets/Settings_colors.png)

Select a category in the drop down list on the left, then either use the color picker (browser dependent) or check "site default" to use the default color for links from your selected theme (orange for default theme).

The reset icon sets back the color for the selected category to the default one for the script.

The drop down list is updated dynamically with the configured order and colors to have a better vision of what it will look like.

### Sort order

The text box allows to choose the order for the different categories on the game lists where a sort is done.

Values must be given comma separated (with optional spaces). The component should tell you if a value is invalid or missing.

All the following values must be present:
- SmallSet: games with achievements, not played, and few points (on pages where the points are displayed)
- Default: games with achievements, not played, not considered small sets
- Mastered: games with all achievements unlocked
- Ignored: games in the ignored list (no UI available yet, must be edited through localStorage.Ignored_add and localStorage.Ignored_delete values in the browser console)
- NoSet: games with no official achievement
- Hub: self explanatory

The sort order must also have either "Started" and "Halfway", or (exclusive) "Played".

The reset icon on the right allows to restore the default order.

### Other parameters

- *Small set threshold*: number of points bellow which a game is considered a small set for coloring and sorting. Only effective on pages with the number of points displayed (hubs, console games list, developer sets). Set to 0 to have all sets in the same category (or use "Played" in the sort order)

- *Show progress for 100% unlocks*: on tables with a number of achievements but no progress bar (*All Games* and *Want to Play* as of today), the number of achievements is replaced by a progression of type unlocked/total. This parameter disables this behavior for games with all achievements unlocked.
  Here it is disabled:
  ![No progress for 100% unlock](/assets/Settings_100_noprogress.png)
  
- *Use hardcore progress*: allows to use hardcore progress only to determine which games are started, half done and mastered. This is only meaningful for "mixed" players (using both modes).

- *Game lists with progress bars*: allows to disable coloring on Hubs, console games lists and developer sets lists as the new display for these pages can be considered clear enough. The sorting can also be disabled as it messes with the one provided by these pages, unless using [RA_EnhancedHubSort](https://github.com/Mindhral/RA_userscripts/tree/main#ra_enhancedhubsort) at the same time

- *Completion progress*: allows to disable the coloring on other users completion progress pages.
