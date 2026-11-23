# Phase 3 physical-device gate

**The owner’s Safari visual and interaction check on the physical 2020 M1 MacBook Air satisfies the device gate. Phase 3 is approved.** The 390×844 Chrome proxy at 4× throttle covers phone performance in each phase. Mobile performance is unmeasured on hardware.

## Set up the same signed-in build

1. Use the Phase 3 review commit and worktree listed in the review note. From its `app/` directory, run `CHOKIDAR_USEPOLLING=1 npm run dev -- --host 127.0.0.1 --port 5320 --strictPort --force`. If port 5320 already has a listener, use `lsof -nP -iTCP:5320 -sTCP:LISTEN` to find its PID and `lsof -a -p PID -d cwd` to verify its working directory. Reuse the matching listener or restart the old Vite instance from this worktree. Keep the configured Auth and report API available.
2. Open [Dashboard](http://127.0.0.1:5320/dashboard) and sign in. Select **Console** if Classic is visible. Use the same account and data for both runs. A review account is preferable when sharing traces. Keep personal-data recordings local until reviewed.
3. Set browser zoom to 100%, leave CPU and network throttling disabled, turn off the optional start screen and mute sound for the comparison. Leave the OS motion preference unchanged across runs and record its state. Use a 60 Hz display setting. Record the selected tier and effective tier.
4. Warm the exact path once by opening Overview and Income and returning Home. Begin each recording on the Overview preview after the scene settles. Use Safari for the owner’s visual and interaction check. For a comparable local trace, run the same sequence in Full and Reduce effects. If Automatic resolves to another tier, record that result separately.

## Safari Web Inspector on the M1 MacBook Air

1. In Safari Settings → Advanced, enable **Show features for web developers**. Open the signed-in Dashboard and use **Develop → Show Web Inspector** or **Option–Command–I**. Keep the page viewport the same for both runs. If the Inspector dock changes it, detach the Inspector or record the final size.
2. Open **Timelines**. Enable **Layout & Rendering** and **JavaScript & Events**, and **CPU** when offered. Keep allocation and heap recording off. Start recording and return focus to the app.
3. Run the sequence below. After the tab-visibility step, return to this recording. Stop and open **Frames**. Check frame intervals and the JavaScript, layout and paint work in the marked or noted ranges.
4. Export the recording from Timelines using **Export** or **Command–S**. Name the files `phase3-m1-safari-full` and `phase3-m1-safari-reduce`, retaining the browser’s export extension. If your Safari version omits a compositor metric, record the available rendering work and write “unavailable” in that field. [Enable Web Inspector](https://webkit.org/web-inspector/enabling-web-inspector/) · [Timelines, Frames and export](https://webkit.org/web-inspector/timelines-tab/)

## Trace sequence

Repeat at normal speed in each tier. Note elapsed recording times for each step.

| Step | Action | Look for |
| --- | --- | --- |
| 1 | Hold Overview for 5 s. On Safari move the pointer slowly in a broad loop over an empty part of the scene. | Frame cadence and ambient work. Use this same 5 s window for the Reduce-effects comparison. |
| 2 | Rapidly preview Overview → Accounts → Income → Expenses → Income. Use arrows or hover. Wait 2 s on Income. | Responsive focus, no focus-induced layout shift, one settled backdrop after the 380 ms dwell. |
| 3 | Open Income, scroll until the header compacts, scroll back, and select Home. Wait 2 s. Then open Overview from Home and return again. | Shared projection and sticky header, warm Home return, no headline overlap or return shift. Inspect any navigation task longer than 50 ms. |
| 4 | Open Control Centre. Scroll the attention row if it overflows, then close the sheet. On Safari use Tab, Shift–Tab and Escape. | Background work pauses, action labels remain legible, focus returns on Safari. |
| 5 | Switch to another browser tab for 3 s, then return and wait 3 s. Keep the same app tab open. | Scene work stops while hidden and resumes without replaying a stale transition. If recording stops automatically, retain both segments and note the gap. |

Use actual rendered frame intervals against the 60 Hz target of 16.67 ms. For comparable timing lanes, collect mean and p95 CPU work per frame for the matched five-second windows. Subtract Reduce effects from the corresponding mean and p95 of the active tier. Report the work that the profiler exposes and record missing lanes explicitly. The local Mac Chrome regression budget is **≤2 ms added mean and ≤3 ms added p95**. Use the physical traces to judge frame delivery, interaction and whether the effects budget holds on the devices.

After recording, use VoiceOver on the Mac to check the reading order without adding screen-reader work to the trace. On Home, move from the section row through the headline, movement figure, trend description and activity. In Overview, verify that the chart and its text alternative precede the companion and secondary modules. Return Home and confirm the originating tile receives focus.

## Results template

Copy this table and fill in measured values. Attach any optional traces.

| Field | M1 MacBook Air / Safari | Chrome phone proxy |
| --- | --- | --- |
| Commit, URL, account or fixture alias | | |
| OS / browser version / viewport / refresh rate | | |
| Effective tier / OS motion / power state | Full · Reduce | Balanced · Reduce |
| Trace filenames and scenario time ranges | | |
| Frame interval mean / p95 / dropped frames | | |
| Longest navigation main-thread task / count over 50 ms | | |
| Focus layout shift / warm Home return layout shift | | |
| Ambient CPU active mean / p95 | | |
| Ambient CPU Reduce mean / p95 | | |
| Ambient added mean / p95 / available profiling lanes | | |
| Pause and resume, Control Centre, hero/collapse observations | | |
| VoiceOver reading order and focus return | | |
| Verdict and reason | Pass / Fail / Unmeasured | Pass / Fail / Unmeasured |
