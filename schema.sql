-- ========================================
-- TABLE: domains
-- ========================================

DROP TABLE IF EXISTS domains;

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY,
    domain_name TEXT NOT NULL UNIQUE COLLATE NOCASE, -- Case insensitive
 status TEXT NOT NULL DEFAULT 'not_checked' 
        CHECK (status IN ('not_checked', 'available', 'registered', 'error')),

    expires DATETIME DEFAULT NULL, -- When the domain expire

    -- Full API response data storage
    raw_domain_data JSON DEFAULT NULL, -- Complete domain availability check response from WhoisJson API
    raw_ns_data JSON DEFAULT NULL,     -- Complete DNS/NSLookup response from WhoisJson API  
    raw_ssl_data JSON DEFAULT NULL,    -- Complete SSL certificate data from WhoisJson API
    error_message TEXT DEFAULT NULL,   -- Store detailed error messages for failed domain checks

    -- Metadata
    check_count INTEGER DEFAULT 0, -- How many times checked
    last_domain_checked DATETIME DEFAULT NULL, -- When last API call was made
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sample data with numeric status
INSERT INTO domains (domain_name, status, check_count) VALUES
('example.com', 'not_checked', 0), -- Not Checked (Registered)
('example.org', 'not_checked', 0); -- Error

-- Auto-update trigger for domains
CREATE TRIGGER IF NOT EXISTS update_domains_timestamp 
    AFTER UPDATE ON domains
    FOR EACH ROW
BEGIN
    UPDATE domains SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Indexes for domains
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_updated ON domains(updated_at);
CREATE INDEX IF NOT EXISTS idx_domains_last_domain_checked ON domains(last_domain_checked);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_name ON domains(domain_name);

-- ========================================
-- TABLE: settings
-- ========================================
DROP TABLE IF EXISTS settings;

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL, -- Category of settings (e.g., 'api', 'ui', 'notifications')
    key TEXT NOT NULL, -- Unique key within category
    json_config_data TEXT NOT NULL, -- JSON string (not encrypted)
    enabled BOOLEAN DEFAULT NULL, -- NULL for no preference, TRUE/FALSE for enabled/disabled
    description TEXT DEFAULT NULL, -- Human readable description
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Sample data // Hidden because you generate once you enter the data
-- INSERT INTO settings (category, key, json_config_data, enabled, description) VALUES
-- -- API settings (enabled = NULL)
-- ('api', 'who_is_json', '{}', 1, 'WhoisJSON API Configuration'),

-- -- UI settings (enabled = NULL)  
-- ('ui', 'view_settings', '{}', NULL, 'User Interface Preferences'),

-- -- Notification settings (enabled = TRUE/FALSE)
-- ('notifications', 'slack', '{}', FALSE, 'Slack - Notification Settings'),
-- ('notifications', 'resend', '{}', FALSE, 'Resend - Notification Settings');

-- Auto-update trigger for settings
CREATE TRIGGER IF NOT EXISTS update_settings_timestamp 
    AFTER UPDATE ON settings
    FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Indexes for settings
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_enabled ON settings(enabled) WHERE enabled IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_cat_key ON settings(category, key);