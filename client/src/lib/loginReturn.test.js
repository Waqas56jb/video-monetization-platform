import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginHref } from './loginReturn.js'

test('the header carries the video you were watching', () => {
  assert.equal(loginHref({ pathname: '/watch/how-to-cook-pilau-properly', search: '' }), '/login?next=%2Fwatch%2Fhow-to-cook-pilau-properly')
})

test('query on the page travels with it', () => {
  assert.equal(loginHref({ pathname: '/explore', search: '?category=music' }), '/login?next=%2Fexplore%3Fcategory%3Dmusic')
})

test('the landing page keeps the dashboard — nothing there to return to', () => {
  assert.equal(loginHref({ pathname: '/', search: '' }), '/login')
})

test('login and signup never point back at themselves', () => {
  assert.equal(loginHref({ pathname: '/login', search: '?side=creator' }), '/login')
  assert.equal(loginHref({ pathname: '/signup', search: '' }), '/login')
})

test('extras still ride along', () => {
  assert.equal(loginHref({ pathname: '/creator/abc', search: '' }, { side: 'viewer' }), '/login?next=%2Fcreator%2Fabc&side=viewer')
})

test('a missing location is not a crash', () => {
  assert.equal(loginHref(undefined), '/login')
})
