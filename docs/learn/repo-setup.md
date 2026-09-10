---
title: Repo setup for workshop mentees
description: Fork Adelpha with every branch, clone workshop/delta-2026 from your fork, and open pull requests into that branch instead of main.
icon: lucide/git-fork
---

# Repo setup

DELTA DIY MRI workshop notebooks live in [`console/notebooks/`](https://github.com/imr-framework/adelpha/tree/workshop/delta-2026/console/notebooks) on the **`workshop/delta-2026`** branch. Open pull requests **into that branch**, not `main`.

!!! warning "Copy every branch"
    When you fork, uncheck **Copy the `main` branch only**. If that box stays checked, your fork will not have `workshop/delta-2026`.

## 1. Fork the repo with all its branches

Open [imr-framework/adelpha](https://github.com/imr-framework/adelpha) and choose **Fork**. Uncheck **Copy the `main` branch only** so the fork includes `workshop/delta-2026`. Then create the fork.

<figure class="adelpha-preview">
  <img src="../assets/forking_all_branches.png" alt="GitHub Create a new fork page with Copy the main branch only unchecked." width="1440" />
  <figcaption>Leave <strong>Copy the <code>main</code> branch only</strong> unchecked so the workshop branch is on your fork.</figcaption>
</figure>

## 2. Clone the workshop branch from your fork

Use the HTTPS or SSH URL of **your fork**, not `imr-framework/adelpha`.

```bash
git clone -b workshop/delta-2026 [your repo url]
cd adelpha
```

Or, in an existing clone of your fork:

```bash
git fetch origin
git checkout workshop/delta-2026
git pull --rebase origin workshop/delta-2026
```

## 3. Start a short-lived branch

Do not commit on the shared workshop branch.

```bash
git checkout -b workshop/notebooks-your-topic
```

Replace `your-topic` with a short name for your session or notebook.

## 4. Add or edit notebooks

Work only under `console/notebooks/`.

- Name files `NN_short_name.ipynb` so they sort in teaching order. `01_setup_environment.ipynb` is the setup notebook.
- Put a title cell at the top that states the session goal.
- You can group notebooks in subfolders, for example `console/notebooks/acq` for acquisition.

## 5. Keep the commit small

Do not commit the workshop virtualenv, checkpoints, or bulky execution output.

- `console/notebooks/.diy-mri-workshop/` and `.ipynb_checkpoints/` stay local.
- Clear cell outputs before you commit if a notebook grew large.

## 6. Commit, push, and open a PR

```bash
git add console/notebooks/
git commit -m "Add workshop notebook: short description"
git push -u origin HEAD
```

On GitHub, set the PR base to `workshop/delta-2026`. With `gh`:

```bash
gh pr create --base workshop/delta-2026 --title "Add workshop notebook: short description" --body "Mentor notebook for the DELTA DIY MRI workshop."
```

!!! tip "Check the base branch"
    If GitHub offers `main` as the default base, change it to `workshop/delta-2026` before you create the pull request.
