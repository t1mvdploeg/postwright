# Standalone studio design

The studio is a warm working surface around fixed, loud sample artwork. The first useful viewport is the post desk, the export preview or the dated plan. The design retains Postwright's logo and locally hosted Inter; it uses clay for selected navigation, links and primary actions, with olive ink for check and schedule context.

| Token           | Light     | Dark      |
| --------------- | --------- | --------- |
| Paper           | `#f8f7f3` | `#211f1a` |
| Surface         | `#fffefa` | `#28251f` |
| Sidebar         | `#efeee7` | `#1b1915` |
| Canvas          | `#eeede6` | `#302d25` |
| Ink             | `#292b27` | `#f0eee6` |
| Secondary text  | `#64675e` | `#b8b2a5` |
| Hairline        | `#dedfd5` | `#444035` |
| Clay text/focus | `#ad3f2b` | `#f09a80` |

Primary buttons use `#ad3f2b` with paper-white text in either mode. Artwork independently retains ink `#2b110b`, accent `#d13c21`, paper `#fff7f3` and light accent `#ff9b85`.

Artwork uses explicit 7% horizontal insets instead of wrapper padding. The Steps body starts at 24% of the artwork width, leaving clearance below its final explanation. Padding would change the container-query content size and rescale the artwork.

Desktop uses a 216px navigation rail, a 72px toolbar and 40px content gutters. Overview has three artwork columns and a 258px agenda. Editor groups Content, Artwork and Review; optional post details use native disclosure. Planner combines dated agenda rows and a draft context column. Functional text is at least 12px, with 14px card titles, 16px section headings and compact screen titles. Border radii range from 4px for artwork to 12px for the agenda surface.

At 760px and below, persistent bottom navigation replaces the sidebar, the desk becomes artwork-and-title rows, and the Editor becomes Content/Preview/Review tabs. Phone fields use 16px text. Tablet layouts collapse the agenda below the desk and move the editor review area below content and artwork. Focus is visible, native controls retain keyboard behavior and reduced motion removes transitions. System colour mode is the default, with a session-only manual override.

These decisions describe the implemented source. Browser rendering and screenshot comparisons remain unverified because browser access was blocked.
