const supertest = require("supertest")
const { app } = require("../app")

let foo = 0

describe('GET /call-backend', async () => {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    foo += 1
    console.log(`Foo ${foo}`)
  }

  const agent = supertest.agent(app)

  it('should respond with a message from the backend service', (done) => {
    agent
      .get("/call-backend")
      .expect(200, { message: "Backend says: 'Hello from Go!'" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })
})

