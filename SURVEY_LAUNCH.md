# Fluke Feedback Survey — Launch Guide

The survey plan is implemented. This guide gets you from here to a live, shareable survey link.

---

## Deliverable

A ready-to-use survey page is at:

```
c:\Users\yga-adm\CascadeProjects\windsurf-project\fluke-feedback-survey.html
```

It contains all 5 questions, matches Fluke's dark theme, is mobile-friendly, and is accessible (keyboard navigable, focus indicators, reduced-motion support, `aria-label`s on rating buttons).

**Current limitation:** The page stores responses in `localStorage` only. For a real test with a remote group, you need to either:

1. **Copy the questions into Tally.so** (recommended — matches the plan)
2. **Copy the questions into Google Forms** (fallback for corporate networks)
3. **Deploy the HTML page and add a real backend** (more work)

---

## Option 1: Tally.so (Recommended — 5 minutes)

1. Go to [tally.so](https://tally.so) and create a free account.
2. Create a new form.
3. Add the 5 questions below exactly as written.
4. Set **Q1 and Q2 as required**; leave the rest optional.
5. Publish and copy the shareable link.
6. Paste the link in your game chat, Slack/Teams, or follow-up email.

### Questions to paste into Tally

| # | Question | Type | Options / Notes |
|---|----------|------|-----------------|
| 1 | Overall, how fun was Fluke? | Scale 1–5 | Labels: 1 = Not fun, 5 = Really fun. Required. |
| 2 | How easy was it to understand what to do at each stage? | Scale 1–5 | Labels: 1 = Very confusing, 5 = Very clear. Required. |
| 3 | Did anything feel confusing, broken, or too slow? | Long text | Optional. Placeholder: `e.g., I didn't realize it was my turn to read` |
| 4 | Would you play this again with (or without) the team? | Multiple choice | Yes, definitely; Maybe, if it were shorter; Maybe, if we had more time; No, not my thing; Not sure. Optional. |
| 5 | Any other feedback / suggestions / feature requests? (very appreciated!) | Long text | Optional. Placeholder: `Anything else we should know — what worked, what didn't, what you'd want to see next time` |

### Settings

- **Collect emails:** OFF (anonymous)
- **IP collection:** OFF
- **One response per device:** OFF (anonymous drop-in)
- **Thank-you page:** "Thanks! Your feedback helps make Fluke better."

---

## Option 2: Google Forms (Fallback)

1. Go to [forms.google.com](https://forms.google.com).
2. Create a blank form.
3. Add the 5 questions above.
4. For Q1 and Q2, use **Linear scale** with 1–5.
5. Make Q1 and Q2 required.
6. Set the form to **not collect email addresses** (gear icon → untick "Collect email addresses").
7. Share the link.

---

## Option 3: Deploy the HTML Page

If you prefer to use the provided HTML file as the live survey, you need a form backend. The fastest no-code options:

### A. Formspree

1. Sign up at [formspree.io](https://formspree.io).
2. Create a new form and get your endpoint URL, e.g. `https://formspree.io/f/YOUR_ID`.
3. Open `fluke-feedback-survey.html`.
4. Replace the entire `<form id="feedback-form" novalidate>` opening tag and the in-page script with:

```html
<form id="feedback-form" action="https://formspree.io/f/YOUR_ID" method="POST">
```

5. Remove the `<script>` block at the bottom of the page.
6. Deploy the file to Netlify, Vercel, GitHub Pages, or any static host.

### B. Netlify Forms

1. Add `data-netlify="true"` and a hidden `form-name` input to the `<form>` tag.
2. Deploy to Netlify.
3. Submissions appear in the Netlify dashboard.

---

## Distribution Message

Copy and paste this after the game:

> Thanks for playing Fluke! 🎉  
> Quick anonymous feedback — 5 questions, under 60 seconds:  
> [YOUR SURVEY LINK]  
> Please fill it out before tomorrow if you can.

---

## Analysis Reminder

After closing responses:

1. Export CSV from Tally / Google Forms.
2. Average Q1 (fun) and Q2 (clarity).
3. Count Q4 responses.
4. Tag themes in Q3 and Q5.
5. Use the decision thresholds from the plan:
   - **Fun ≥ 4.0 and Clarity ≥ 3.5** → wider rollout
   - **Clarity < 3.5** → prioritize onboarding
   - **Fun < 3.5** → revisit flow or audience fit

---

## Next Action

**Recommended:** Create the form in Tally.so using the questions above, then share the link immediately after your test session.
