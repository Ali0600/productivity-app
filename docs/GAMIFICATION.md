# Gamification: the virtual pet

ADHDone has a small virtual pet (default name **Mochi**) that eats a snack every time you finish a
task. This page records why it works the way it does: what the research says, the rules that came
out of it, and what was left out on purpose.

The research was a sweep of 56 findings across four angles (motivation science, streaks and
forgiveness, virtual pets in apps and studies, ADHD-specific motivation). A second agent opened each
source and tried to refute the claim made from it; 15 claims were corrected along the way and none
were dropped. All 56, with their sources and check results, are in
[GAMIFICATION-FINDINGS.md](GAMIFICATION-FINDINGS.md); the ones this page leans on are numbered at
the bottom.

## What the research says

- **Gamification helps a little, and the effect fades.** Meta-analysis: motivation g = .36,
  behaviour g = .25, weaker in the most rigorous studies [1]. Usage dips after about four weeks and
  partly recovers in weeks 6–10 [15]. Treat the pet as a booster, not the engine of the app.
- **ADHD makes "now" matter more.** People with ADHD discount delayed rewards more steeply
  (d = .43, N = 3,913) [2] and judge time less accurately [3]. The reward has to land inside the
  swipe, and needs must not drain on a clock the user can't feel.
- **Punishment teaches avoidance.** Children with ADHD increasingly avoided a punished option, even
  at a cost [4]; Fish'n'Steps users ignored a sad fish [5]; people avoid looking at bad news about
  their progress [6]. A pet that suffers turns opening the app into the punished option.
- **One miss is harmless; a broken-streak display is not.** Missing one day didn't slow habit
  formation [7]. A self-blamed broken streak cut continuation to 28.9% (intact: 53.2%), and a
  repair offer won most of it back [8].
- **Named slack beats lowered goals.** "Every day, with two emergency skips" beat an equal
  "5 of 7" (4.00 vs 3.11 days a week) [9]. Duolingo's lower daily bar raised day-14 retention [10].
- **Surprise is safe; a price list is not.** Expected tangible rewards undermined free choice
  (d = −.36); unexpected ones didn't (d = .01); informational feedback beat controlling [11].
- **Death is the wrong lever.** Simulated death brings grief, or indifference once bored [12];
  Finch's pets never die [13]; reviewers love cuteness and names, and lost progress reads as
  heartbreak [14].
- **A pet that responds has more pull than an always-happy one.** Teens whose phone pet showed both
  happy and sad moods ate breakfast about twice as often as teens with a happy-only pet (39 teens,
  9 days) [20]. Small study, so the dips stay mild and one task always fixes them.

## The rules, as built

The rules live in [`app/utils/pet.js`](../app/utils/pet.js), and how the pet reacts to each event
in [`app/utils/petMessages.js`](../app/utils/petMessages.js). Every rule below is pinned by a test
that has been seen to fail: `npm run test:mutations` breaks each one on purpose (the list is
[`scripts/pet-mutations.json`](../scripts/pet-mutations.json)) and checks that a test catches it.

| Rule | Value | Why |
| --- | --- | --- |
| A finished task is a snack, eaten on the swipe | 1 per completion, any list | Reward inside the gesture [2] |
| Hunger is **daily**, never hourly | Each day starts peckish | Time blindness [3] |
| Fed / full | 1 snack fed, 3 full | A near goal with a bigger reaction [18] |
| Floor state | Napping, after 2 full days with no completion | One miss costs nothing [7] |
| What neglect costs | Nothing: no sickness, death, lost items or reversed growth | [4][5][12] |
| Growth | Care days (days with ≥ 1 completion): hatch on the first, kid 7, teen 21, grown-up 60, a new room every 30 after | Gaps pause, never reverse [13] |
| Trick bar | 12 slots, starts with 2 filled, so a trick every 10 snacks; 12 tricks, then encore gifts | Endowed progress, goal gradient [18] |
| Surprise gifts | 18% chance per completion, at most 1 a day; 30 treasures, no repeats until all found | Unexpected rewards don't undermine [11] |
| Rest days | First 2 empty days of a week show as rest (☾), not misses; a week within that is a **cozy week**. Counted from the hatch day: days as an egg are onboarding | Named reserves [9] |
| Welcome back | The first look after a nap wakes it, with a plain-time line on that day only ("3 days! Mochi napped like a champion."). After 7+ empty days it also brings a dream souvenir and +2 trick slots, stopping one short of a full bar. Finishing a task before seeing the pet still wakes it first | Fresh start, repair [17][8] |
| Calm mode | Always content: never peckish, never napping, no yawn on waking | For days the mild dips feel like pressure |
| Copy | Informational, never a verdict on the user, no task-for-reward countdowns; a test bans blame words | [8][11] |

Snacks are read from the completion log through a watermark rather than awarded by the code that
completes a task. Every way a task gets completed feeds the pet, deleting a task never takes a snack
back, and a save lost to a crash heals itself on the next launch, because the unread completions are
still in the log. A backup import feeds only completions newer than the pet's watermark; if the
backup carries a pet, the app keeps whichever pet has grown more, so a restore never rolls it back.

## Left out on purpose

- **Sickness, death, running away, losing items or levels.** See the rules above.
- **HP or damage for overdue tasks.** All 45 users in a Habitica field study hit counterproductive
  effects, such as being punished on their most productive days [19]. A to-do list always has
  something overdue.
- **"Your pet is hungry because you skipped" notifications.** Self-blame cuts continuation most [8].
- **Pet penalties on the Focus Gate.** Stacking punishment builds avoidance [4].

## Not built yet

- **Pet-voiced notifications:** a large rotating pool, invitations only [16]. Would plug into the
  message pool in `NotificationService`.
- **Story chapters** that follow your real lists (clear the Kitchen list, the pet explores the
  pantry); progress told as a character's story kept people active better over four months than
  an equally polished display without one [21].
- **A home-screen widget** (needs a native build), since an always-visible display held activity
  through the holidays in UbiFit [5].

## Is it helping?

The pet's page compares tasks a day and active days a week before and since the pet arrived.
*Before* is snapshotted once, when the pet arrives: whole days in the 28 before it (fewer if the
completion history is shorter). It is stored on the pet because the history itself shrinks when
tasks are deleted, and a shrinking baseline would make the pet look like it helped. *Since* counts
whole days from the arrival day up to yesterday, from the pet's own counters, which deleting a task
never lowers. Both sides appear once they span a week. Expect a novelty bump, then a sag from about
week 4; the research suggests judging at weeks 10–14 [15].

## Open questions

- **Gentle streaks.** The tile badges (🔥) still reset after a missed day. The research suggests a
  miss should pause the count, never zero it [8]. Revisit at `computeStreak` in
  `app/utils/streaks.js`.

## Sources

1. Sailer & Homner (2020), The Gamification of Learning: a Meta-analysis, *Educational Psychology Review* 32. https://opus.bibliothek.uni-augsburg.de/opus4/files/109056/109056.pdf
2. Jackson & MacKillop (2016), ADHD and Monetary Delay Discounting: A Meta-Analysis, *Biol Psychiatry CNNI* 1(4). https://pmc.ncbi.nlm.nih.gov/articles/PMC5049699/
3. Zheng et al. (2022), Time Perception Deficits in Children and Adolescents with ADHD: A Meta-analysis, *J Atten Disord* 26(2). https://doi.org/10.1177/1087054720978557
4. Furukawa et al. (2017), Evidence for increased behavioral control by punishment in children with ADHD, *J Child Psychol Psychiatry* 58(3). https://pubmed.ncbi.nlm.nih.gov/27611786/
5. Consolvo et al. (2008), Flowers or a Robot Army? Encouraging Awareness & Activity with Personal, Mobile Displays, UbiComp. https://www.pensivepuffin.com/dwmcphd/papers/Consolvo.et.al.UbiComp08.pdf
6. Webb, Chang & Benn (2013), The Ostrich Problem: Motivated Avoidance or Rejection of Information About Goal Progress. https://eprints.whiterose.ac.uk/id/eprint/76946/1/Webb%20et%20al.%20%282013%29%20-%20ostrich%20problem%20review.pdf
7. Lally et al. (2010), How are habits formed: Modelling habit formation in the real world, *EJSP*. https://doi.org/10.1002/ejsp.674
8. Silverman & Barasch (2023), On or Off Track: How (Broken) Streaks Affect Consumer Decisions, *JCR*. https://udspace.udel.edu/bitstreams/7e3e3b64-8bf2-4527-ac93-94a160358165/download
9. Sharif & Shu, Nudging persistence after failure through emergency reserves, *OBHDP*. https://anderson-review.ucla.edu/wp-content/uploads/2021/03/Sharif-Shu_EmergencyReserveFailure_OBHDP2019.pdf
10. Duolingo, Improving the streak: forming habits one lesson at a time (company data). https://blog.duolingo.com/improving-the-streak
11. Deci, Koestner & Ryan (1999), A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation, *Psychological Bulletin* 125(6). https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf
12. Dodd, Fowler & Lottridge (2025), Purr-ogrammed Love: A Narrative Review of Virtual Pets, *Entertainment Computing*. https://openrepository.aut.ac.nz/bitstreams/22fd433c-f410-4558-8cda-845f56128b4a/download
13. Finch FAQ (official). https://befinch.notion.site/Finch-FAQ-474652d0123d4883ac7a0cd6c8f5aa70
14. Appbot, What 40,294 Finch App Reviews Reveal About Emotional Attachment. https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/
15. Rodrigues et al. (2022), Gamification suffers from the novelty effect but benefits from the familiarization effect, *IJETHE* 19. https://bv.fapesp.br/en/publicacao/211691/amification-suffers-from-the-novelty-effect-but-benefits-fro
16. Yancey & Settles (2020), A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications, KDD. https://research.duolingo.com/papers/yancey.kdd20.pdf
17. Dai, Milkman & Riis (2014), The Fresh Start Effect, *Management Science*. https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
18. Kivetz, Urminsky & Zheng (2006), The Goal-Gradient Hypothesis Resurrected, *JMR* 43. https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
19. Diefenbach & Müssig (2019), Counterproductive effects of gamification: the gamified task manager Habitica, *IJHCS*. https://epub.ub.uni-muenchen.de/77668
20. Byrne et al., Caring for mobile phone-based virtual pets can influence youth eating behaviors, *Journal of Children and Media* (as summarised by Cornell Chronicle, 2011, and Calvert, Staiano & Bond, 2013). https://doi.org/10.1080/17482798.2011.633410
21. Murnane et al. (2023), Narrative-Based Visual Feedback to Encourage Sustained Physical Activity: A Field Trial of the WhoIsZuki Mobile Health Platform, *IMWUT*. https://doi.org/10.1145/3580786
