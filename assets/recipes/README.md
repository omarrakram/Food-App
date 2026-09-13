# Recipe photography

Downloaded, not hot-linked. Every file here was acquired from Wikimedia Commons
under a licence this project may publish under, and every one has a row in
`../../data/images/manifest.json` recording its creator, licence, attribution
and source page.

Nothing in this directory is edited by hand:

    npm run images:fetch    # acquire (needs network access to Commons)
    npm run images:index    # rebuild the module the bundler sees
    npm run images:check    # validate — runs in CI

`images:fetch` cannot run in the development sandbox, whose egress proxy blocks
every image host. `.github/workflows/recipe-images.yml` runs it where the
network is open and commits the result.
