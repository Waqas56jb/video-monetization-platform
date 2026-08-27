import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardPath, homeTabFor, panelRoleFor, hasCreatorStudio, sideFromSearch } from './accountSide.js'

test('creator account can open the viewer panel', () => {
  assert.equal(panelRoleFor('creator', 'viewer'), 'viewer')
  assert.equal(panelRoleFor('creator', 'creator'), 'creator')
  assert.equal(homeTabFor('viewer'), 'library')
  assert.equal(homeTabFor('creator'), 'overview')
  assert.equal(dashboardPath('creator'), '/dashboard?tab=overview')
})

test('creator profile unlocks the studio even when profile role is viewer', () => {
  assert.equal(panelRoleFor('viewer', 'creator', true), 'creator')
  assert.equal(hasCreatorStudio('viewer', { display_name: 'Test' }), true)
  assert.equal(hasCreatorStudio('viewer', null), false)
})

test('admin and staff can open Watch or Create on the same email', () => {
  assert.equal(panelRoleFor('sub_admin', 'creator'), 'creator')
  assert.equal(panelRoleFor('sub_admin', 'viewer'), 'viewer')
  assert.equal(panelRoleFor('admin', 'viewer'), 'viewer')
  assert.equal(panelRoleFor('admin', 'creator'), 'creator')
})

test('signup to Create opens the application, not the studio', () => {
  assert.equal(dashboardPath('become'), '/dashboard?tab=become')
  assert.equal(dashboardPath('apply'), '/dashboard?tab=become')
  assert.equal(dashboardPath('viewer'), '/dashboard?tab=library')
})

test('signup and login read the Watch or Create side from the URL', () => {
  assert.equal(sideFromSearch('?side=creator'), 'creator')
  assert.equal(sideFromSearch('?side=viewer'), 'viewer')
  assert.equal(sideFromSearch('?next=/watch/x'), null)
})
