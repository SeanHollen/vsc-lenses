VS code supports 2 side tabs which allow the user to open file views

- "Explorer"
    - open files from here, the top tab will show the name of the file
    - let's call these file tabs "explorer file tabs"
- "Source Control"
    - open staged files from here, it will show `<file name> (index)`
    - open unstaged files from here, it will show `<file name> (working tree)`
    - let's call these file tabs "source control file tabs"

let's call "explorer" and "source control" as different viewing "modes"

it's worth notingn that the source control tab names are visibly more verbose, and therefore take up more horizontal real estate. I use them frequently, but I don't want them open at all times, which makes it annoying to manually close them.

both explorer file tabs and source control file tabs will persist when the user switches modes. in other words, there is one global list of open tabs.

I want different behavior. I want to save per-mode file tabs. when I open the explorer mode, I want to see only explorer file tabs. when I open the source control mode, I only want to see source control file tabs. it should remember which tabs are open for each. so I can toggle back and forth, and see what I previously had open. 

this is not current behavior.  I want to create a vs code browser extension which simulates this behavior. 

it can come with conveniences, like if I'm viewing a file in one mode, and I switch to another mode, then by default it should move me to that mode's equivalent-file, and vice versa - selecting it if it was previously opened, or creating opening it if not. however, those are details - the primary thing is that it opens and closes the tabs that are opened depending if I'm in file-explorer mode or source-control viewing mode (controlled by the left primary tabs)

Existing vs code extensions focus on tab groups, it seems, which is not what I want. I'm surprise this isn't default behavior, never mind that there's not a good extension which already does this. Can we create this as an extension, or is there some sort of limitation .