# Clone the public repository
git clone https://github.com/pages-cms/pages-cms.git
cd pages-cms

# Rename the original remote to upstream
git remote rename origin upstream

# Create a new private repository on GitHub

# Add the new private repository as a remote named origin
git remote add origin https://github.com/your-username/private-repo.git

# Push to the new private repository and set the upstream reference
git push -u origin main

# Disable push to upstream
git remote set-url --push upstream no_push

# Keeping your private fork up-to-date
git fetch upstream
git merge upstream/main
git push

# Ignoring upstream changes
git update-index --skip-worktree db/migrations/*.sql
git update-index --skip-worktree db/migrations/meta/*.json
