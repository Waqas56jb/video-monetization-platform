import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardPath, homeTabFor, panelRoleFor, sideFromSearch } from './accountSide.js'

test('creator account can open the viewer panel', () => {
  assert.equal(panelRoleFor('creator', 'viewer'), 'viewer')
  assert.equal(panelRoleFor('creator', 'creator'), 'creator')
  assert.equal(homeTabFor('viewer'), 'library')
  assert.equal(homeTabFor('creator'), 'overview')
  assert.equal(dashboardPath('creator'), '/dashboard?tab=overview')
})

test('viewer account cannot open the creator panel until that side exists', () => {
  assert.equal(panelRoleFor('viewer', 'creator'), 'viewer')
  assert.equal(panelRoleFor('viewer', 'viewer'), 'viewer')
})

test('staff stay out of a fake studio on the public site', () => {
  assert.equal(panelRoleFor('sub_admin', 'creator'), 'viewer')
  assert.equal(panelRoleFor('admin', 'viewer'), 'viewer')
  assert.equal(panelRoleFor('admin', 'creator'), 'creator')
})

test('signup and login read the Watch or Create side from the URL', () => {
  assert.equal(sideFromSearch('?side=creator'), 'creator')
  assert.equal(sideFromSearch('?side=viewer'), 'viewer')
  assert.equal(sideFromSearch('?next=/watch/x'), null)
})
