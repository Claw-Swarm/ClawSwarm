<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <span class="logo-icon">🦞</span>
          <span class="logo-text">ClawSwarm</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <RouterLink to="/admin/agents" class="nav-item">
          <span class="nav-icon">🤖</span>
          <span>Agents</span>
        </RouterLink>
        <RouterLink to="/admin/tokens" class="nav-item">
          <span class="nav-icon">🔑</span>
          <span>Tokens</span>
        </RouterLink>
        <RouterLink to="/admin/rooms" class="nav-item">
          <span class="nav-icon">💬</span>
          <span>Rooms</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <RouterLink to="/chat" class="nav-item">
          <span class="nav-icon">→</span>
          <span>Open Chat</span>
        </RouterLink>
      </div>
    </aside>

    <!-- Main content -->
    <main class="admin-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.admin-sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-heading);
}

.logo-icon {
  font-size: 20px;
}

.sidebar-nav {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  margin-bottom: 2px;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  text-decoration: none;
}

.nav-item.router-link-active {
  background: var(--accent);
  color: white;
}

.nav-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.admin-main {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
  padding: 24px;
}
</style>
