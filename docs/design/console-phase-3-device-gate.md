# Phase 3 physical-device gate

**Joel runs this gate on the physical 2020 M1 MacBook Air and Pixel 6a.** The local Chrome trace is a regression check. The two device recordings determine whether Phase 3 passes.

## Set up the same signed-in build

1. Use the Phase 3 review commit and worktree listed in the review note. From its `app/` directory, run `CHOKIDAR_USEPOLLING=1 npm run dev -- --host 127.0.0.1 --port 5320 --strictPort --force`. Keep the configured Auth and report API available. Do not reset the local database.
2. Open [Dashboard](http://127.0.0.1:5320/dashboard), sign in and choose **Console**. Use the same account and data on both devices. A review account is preferable when sharing traces. Keep personal-data recordings local until reviewed.
3. Set browser zoom to 100%, leave CPU and network throttling disabled, turn off the optional start screen and mute sound for the comparison. Leave the OS motion preference unchanged across runs and record its state. Use a 60 Hz display setting. On the Pixel, turn off Smooth Display if it is enabled. Record the selected tier and effective tier.
4. Warm the exact path once by opening Overview and Income and returning Home. Begin each recording on the Overview preview after the scene settles. Measure **Full** on Safari and **Balanced** on the Pixel, then repeat the same scenario in **Reduce effects** on each device. If Automatic resolves to another tier, record that result separately.

## Safari Web Inspector on the M1 MacBook Air

1. In Safari Settings → Advanced, enable **Show features for web developers**. Open the signed-in Dashboard and use **Develop → Show Web Inspector** or **Option–Command–I**. Keep the page viewport the same for both runs. If the Inspector dock changes it, detach the Inspector or record the final size.
2. Open **Timelines**. Enable **Layout & Rendering** and **JavaScript & Events**, and **CPU** when offered. Keep allocation and heap recording off. Start recording and return focus to the app.
3. Run the sequence below. After the tab-visibility step, return to this recording. Stop and open **Frames**. Check frame intervals and the JavaScript, layout and paint work in the marked or noted ranges.
4. Export the recording from Timelines using **Export** or **Command–S**. Name the files `phase3-m1-safari-full` and `phase3-m1-safari-reduce`, retaining the browser’s export extension. If your Safari version omits a compositor metric, record the available rendering work and write “unavailable” in that field. [Enable Web Inspector](https://webkit.org/web-inspector/enabling-web-inspector/) · [Timelines, Frames and export](https://webkit.org/web-inspector/timelines-tab/)

## Chrome remote debugging on the Pixel 6a over USB

1. On the Pixel, enable **Developer options** from the build number screen if needed, then enable **USB debugging**. Connect a data-capable USB cable, unlock the Pixel and accept the computer’s debugging prompt.
2. In desktop Chrome, open `chrome://inspect/#devices`, enable **Discover USB devices**, then open **Port forwarding**. Map device port `5320` to Mac `localhost:5320`. If the app uses local Supabase on `127.0.0.1:54321`, also map device `54321` to Mac `localhost:54321`. Leave hosted HTTPS API connections alone. Enable port forwarding.
3. In Chrome **on the Pixel**, open [Dashboard](http://127.0.0.1:5320/dashboard), sign in and enable Console. From `chrome://inspect/#devices` on the Mac, click **Inspect** for that Pixel tab. Disable live screencasting in the remote DevTools toolbar. Drive the sequence on the phone.
4. Open **Performance** and confirm **No throttling** for CPU and network. Start a runtime recording. After the sequence, stop and inspect **Frames**, **Main**, available raster/compositor tracks and **Layout Shifts**. Use the download menu → **Save trace**. Name the files `phase3-pixel6a-chrome-balanced.json.gz` and `phase3-pixel6a-chrome-reduce.json.gz`. [Remote device setup](https://developer.chrome.com/docs/devtools/remote-debugging) · [USB port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server) · [Save performance traces](https://developer.chrome.com/docs/devtools/performance/save-trace)

## Trace sequence

Repeat at normal speed in each tier. Note elapsed recording times for each step.

| Step | Action | Look for |
| --- | --- | --- |
| 1 | Hold Overview for 5 s. On Safari move the pointer slowly in a broad loop over an empty part of the scene. On Pixel keep the finger off the screen during this matched window. | Frame cadence and ambient work. Use this same 5 s window for the Reduce-effects comparison. |
| 2 | Rapidly preview Overview → Accounts → Income → Expenses → Income. Use arrows or hover on Safari and single taps on Pixel. Wait 2 s on Income. | Responsive focus, no focus-induced layout shift, one settled backdrop after the 380 ms dwell. |
| 3 | Open Income, scroll until the header compacts, scroll back, and select Home. Wait 2 s. Then open Overview from Home and return again. | Shared projection and sticky header, warm Home return, no headline overlap or return shift. Inspect any navigation task longer than 50 ms. |
| 4 | Open Control Centre. Scroll the attention row if it overflows, then close the sheet. On Safari use Tab, Shift–Tab and Escape. On Pixel use the visible close action. | Background work pauses, action labels remain legible, focus returns on Safari. |
| 5 | Switch to another browser tab for 3 s, then return and wait 3 s. Keep the same app tab open. | Scene work stops while hidden and resumes without replaying a stale transition. If recording stops automatically, retain both segments and note the gap. |

Use actual rendered frame intervals against the 60 Hz target of 16.67 ms. For comparable timing lanes, collect mean and p95 CPU work per frame for the matched five-second windows. Subtract Reduce effects from the corresponding mean and p95 of the active tier. Report the work that the profiler exposes and record missing lanes explicitly. The local Mac Chrome regression budget is **≤2 ms added mean and ≤3 ms added p95**. Use the physical traces to judge frame delivery, interaction and whether the effects budget holds on the devices.

## Results template

Copy this table and fill in measured values. Attach both traces for each device.

| Field | M1 MacBook Air / Safari | Pixel 6a / Chrome |
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
| Verdict and reason | Pass / Fail / Unmeasured | Pass / Fail / Unmeasured |
