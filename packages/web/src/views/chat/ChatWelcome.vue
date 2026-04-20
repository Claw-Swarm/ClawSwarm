<template>
  <div class="chat-welcome">
    <div class="welcome-content">
      <div class="welcome-icon">🦞</div>
      <h2>Welcome to ClawSwarm</h2>
      <p>Select a room or agent from the sidebar to start chatting.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.chat-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.welcome-content {
  text-align: center;
  max-width: 400px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

p {
  color: var(--text-secondary);
}
</style>
