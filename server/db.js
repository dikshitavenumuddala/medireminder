const { MongoClient } = require('mongodb');
const config = require('./config');

const COLLECTIONS = ['users', 'medicines', 'reminders', 'caregivers', 'notifications'];
let client;
let database;

async function init() {
  client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  database = client.db(config.mongo.database);
  await database.command({ ping: 1 });

  await Promise.all([
    collection('users').createIndex({ email: 1 }, { unique: true }),
    collection('users').createIndex({ invite_code: 1 }, { unique: true, sparse: true }),
    collection('medicines').createIndex({ user_id: 1, is_active: 1, deleted_at: 1 }),
    collection('reminders').createIndex({ medicine_id: 1, scheduled_time: 1 }, { unique: true }),
    collection('reminders').createIndex({ user_id: 1, scheduled_time: 1 }),
    collection('reminders').createIndex({ status: 1, due_at: 1 }),
    collection('caregivers').createIndex({ user_id: 1, caregiver_user_id: 1 }, { unique: true }),
    collection('caregivers').createIndex({ caregiver_user_id: 1 }),
    collection('notifications').createIndex({ user_id: 1, is_read: 1, id: -1 }),
  ]);

  const counters = collection('counters');
  for (const name of COLLECTIONS) {
    const last = await collection(name).find().sort({ id: -1 }).limit(1).next();
    await counters.updateOne(
      { _id: name },
      { $max: { seq: last ? last.id : 0 } },
      { upsert: true }
    );
  }
  return database;
}

function getDatabase() {
  if (!database) throw new Error('Database not initialised');
  return database;
}

function collection(name) {
  return getDatabase().collection(name);
}

async function nextId(name) {
  const counter = await collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return counter.seq;
}

async function insert(name, document) {
  const record = { ...document, id: await nextId(name) };
  await collection(name).insertOne(record);
  return record;
}

async function insertIfMissing(name, filter, document) {
  const record = { ...document, id: await nextId(name) };
  try {
    const result = await collection(name).updateOne(filter, { $setOnInsert: record }, { upsert: true });
    return result.upsertedCount;
  } catch (error) {
    if (error.code === 11000) return 0;
    throw error;
  }
}

async function find(name, filter = {}, { sort, skip, limit, projection } = {}) {
  let cursor = collection(name).find(filter, { projection });
  if (sort) cursor = cursor.sort(sort);
  if (skip) cursor = cursor.skip(skip);
  if (limit !== undefined) cursor = cursor.limit(limit);
  return cursor.toArray();
}

async function one(name, filter = {}, options = {}) {
  return collection(name).findOne(filter, options);
}

async function count(name, filter = {}) {
  return collection(name).countDocuments(filter);
}

async function update(name, filter, changes) {
  return collection(name).updateOne(filter, changes);
}

async function updateMany(name, filter, changes) {
  return collection(name).updateMany(filter, changes);
}

async function remove(name, filter) {
  return collection(name).deleteOne(filter);
}

async function removeMany(name, filter) {
  return collection(name).deleteMany(filter);
}

async function close() {
  if (client) await client.close();
  client = null;
  database = null;
}

module.exports = {
  init,
  close,
  collection,
  insert,
  insertIfMissing,
  find,
  one,
  count,
  update,
  updateMany,
  remove,
  removeMany,
};
