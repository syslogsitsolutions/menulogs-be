# Ecosystem Config Migration Guide

## Overview

The `ecosystem.config.js` file has been moved from the server to the codebase for better version control and consistency. This guide explains how to migrate from the server-created config to the version-controlled one.

## Migration Steps

### 1. Verify Current PM2 Status

```bash
# SSH into your server
ssh ubuntu@<EC2-IP>

# Check current PM2 processes
pm2 status

# Check if ecosystem.config.js exists on server
ls -la /opt/menulogs/prod/ecosystem.config.js
ls -la /opt/menulogs/dev/ecosystem.config.js  # if using dev environment
```

### 2. Backup Current Config (Optional but Recommended)

```bash
# Backup production config
cp /opt/menulogs/prod/ecosystem.config.js /opt/menulogs/prod/ecosystem.config.js.backup

# Backup dev config (if exists)
cp /opt/menulogs/dev/ecosystem.config.js /opt/menulogs/dev/ecosystem.config.js.backup
```

### 3. Deploy New Code

The next deployment will automatically:
- Extract the new `ecosystem.config.js` from the codebase
- Copy it to `/opt/menulogs/prod/ecosystem.config.js` (or `/opt/menulogs/dev/ecosystem.config.js`)
- Use it with PM2

### 4. Verify New Config is Working

After deployment:

```bash
# Check if new config file exists
cat /opt/menulogs/prod/ecosystem.config.js

# Verify PM2 is using the new config
pm2 describe menulogs-backend-prod

# Check PM2 status
pm2 status
```

### 5. Clean Up Old Backup (After Verification)

Once you've verified everything is working correctly:

```bash
# Remove old backup files (optional)
rm /opt/menulogs/prod/ecosystem.config.js.backup
rm /opt/menulogs/dev/ecosystem.config.js.backup  # if exists
```

## Manual Migration (If Needed)

If you need to manually update the config:

```bash
# Stop PM2 process
pm2 stop menulogs-backend-prod

# Remove old config
rm /opt/menulogs/prod/ecosystem.config.js

# The next deployment will create the new one automatically
# Or manually copy from codebase:
cd /opt/menulogs/prod/app/backend
cp ecosystem.config.js /opt/menulogs/prod/ecosystem.config.js

# Restart with new config
cd /opt/menulogs/prod
PM2_APP_NAME=menulogs-backend-prod PM2_CWD=/opt/menulogs/prod pm2 start ecosystem.config.js --update-env
pm2 save
```

## Benefits of Version-Controlled Config

1. **Version Control**: Changes to PM2 configuration are tracked in git
2. **Consistency**: Same config across all environments
3. **Easy Updates**: Update config in code, deploy automatically
4. **Documentation**: Config is documented with comments
5. **Rollback**: Can revert config changes via git

## Configuration Customization

The `ecosystem.config.js` supports environment variables for customization:

- `PM2_APP_NAME`: Application name
- `PM2_CWD`: Working directory
- `PM2_INSTANCES`: Number of instances
- `NODE_ENV`: Node environment
- `PORT`: Application port

These are automatically set by the CI/CD pipeline during deployment.

## Troubleshooting

### PM2 Process Not Starting

```bash
# Check PM2 logs
pm2 logs menulogs-backend-prod --lines 50

# Check if config file exists
ls -la /opt/menulogs/prod/ecosystem.config.js

# Verify config syntax
node -c /opt/menulogs/prod/ecosystem.config.js
```

### Config Not Updating

```bash
# Manually copy from codebase
cd /opt/menulogs/prod/app/backend
cp ecosystem.config.js /opt/menulogs/prod/ecosystem.config.js

# Reload PM2
pm2 reload menulogs-backend-prod
```

## Notes

- The old server-created `ecosystem.config.js` will be automatically replaced during the next deployment
- No downtime is required - PM2 will reload with the new config
- The config file is now part of the codebase and will be deployed with each release

