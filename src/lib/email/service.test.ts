import { afterEach, describe, expect, it, vi } from "vitest"

import { EmailError } from "./types"
import { EmailProvider } from "./providers"
import type { QueueEmailInput } from "./outbox"
import type { EmailMessage } from "./types"
import { EmailService, emailService } from "./service"

class FakeProvider extends EmailProvider {
  readonly name = "dev"
  calls: EmailMessage[] = []

  constructor(
    private readonly behavior: (message: EmailMessage, index: number) => Promise<void>,
  ) {
    super()
  }

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message)
    await this.behavior(message, this.calls.length)
  }
}

class FakeOutbox {
  available = true
  queues: QueueEmailInput[] = []
  sent: string[] = []
  failed: string[] = []
  private nextId = 1

  isAvailable(): boolean {
    return this.available
  }

  async queue(input: QueueEmailInput): Promise<string | null> {
    this.queues.push(input)
    if (!this.available) {
      return null
    }
    return `id-${this.nextId++}`
  }

  async claimDue(): Promise<never[]> {
    return []
  }

  async markSent(id: string): Promise<void> {
    this.sent.push(id)
  }

  async markFailed(id: string): Promise<void> {
    this.failed.push(id)
  }
}

const INVITATION = {
  to: "boss@acme.test",
  referenceId: "token-x",
  organizationName: "Acme",
  role: "admin",
  acceptUrl: "https://app.example.com/accept?token=x",
}

afterEach(() => {
  vi.useRealTimers()
})

describe("EmailService.send", () => {
  it("envoie et marque sent quand le provider réussit", async () => {
    const provider = new FakeProvider(async () => {})
    const outbox = new FakeOutbox()
    const service = new EmailService({ provider, outbox })

    const result = await service.send("invitation", INVITATION)

    expect(result).toEqual({ delivered: true, queued: false, provider: "dev" })
    expect(outbox.queues).toHaveLength(1)
    expect(outbox.queues[0].referenceId).toBe("token-x")
    expect(outbox.sent).toEqual(["id-1"])
    expect(outbox.failed).toHaveLength(0)
  })

  it("réessaie sur erreur transitoire puis réussit", async () => {
    let attempt = 0
    const provider = new FakeProvider(async (_message, index) => {
      attempt = index
      if (index === 1) {
        throw new EmailError("provider-failure", "transitoire", { retryable: true })
      }
    })
    const outbox = new FakeOutbox()
    const service = new EmailService({ provider, outbox, sendAttempts: 3 })

    const result = await service.send("invitation", INVITATION)

    expect(result.delivered).toBe(true)
    expect(attempt).toBe(2)
    expect(outbox.sent).toEqual(["id-1"])
  })

  it("abandonne immédiatement une erreur définitive (pas de retry)", async () => {
    const provider = new FakeProvider(async () => {
      throw new EmailError("provider-failure", "adresse invalide", { retryable: false })
    })
    const outbox = new FakeOutbox()
    const service = new EmailService({ provider, outbox, sendAttempts: 3 })

    const result = await service.send("invitation", INVITATION)

    expect(result).toEqual({ delivered: false, queued: true, provider: "dev" })
    expect(provider.calls).toHaveLength(1)
    expect(outbox.failed).toEqual(["id-1"])
  })

  it("à cours de retries, laisse l'email en file pour le worker", async () => {
    const provider = new FakeProvider(async () => {
      throw new EmailError("provider-failure", "5xx", { retryable: true })
    })
    const outbox = new FakeOutbox()
    const service = new EmailService({ provider, outbox, sendAttempts: 2 })

    const result = await service.send("invitation", INVITATION)

    expect(result).toEqual({ delivered: false, queued: true, provider: "dev" })
    expect(provider.calls).toHaveLength(2)
    expect(outbox.failed).toEqual(["id-1"])
  })

  it("ne ré-envoie jamais un email déjà en file (idempotence)", async () => {
    const provider = new FakeProvider(async () => {})
    const outbox = new FakeOutbox()
    outbox.available = false
    const service = new EmailService({ provider, outbox })

    const result = await service.send("invitation", INVITATION)

    // isAvailable() false → outbox considérée absente.
    expect(result).toEqual({ delivered: true, queued: false, provider: "dev" })
    expect(outbox.sent).toEqual([])
  })

  it("reporte un envoi déjà mis en file (queue → null) sans double envoi", async () => {
    const provider = new FakeProvider(async () => {})
    const outbox = new FakeOutbox()
    const realQueue = outbox.queue.bind(outbox)
    outbox.queue = async (input) => {
      await realQueue(input)
      return null
    }
    const service = new EmailService({ provider, outbox })

    const result = await service.send("invitation", INVITATION)

    expect(result).toEqual({ delivered: false, queued: true, provider: "dev" })
    expect(provider.calls).toHaveLength(0)
  })

  it("replie en envoi direct quand la file échoue (best-effort)", async () => {
    const provider = new FakeProvider(async () => {})
    const outbox = new FakeOutbox()
    outbox.queue = async () => {
      throw new Error("outbox indisponible")
    }
    const service = new EmailService({ provider, outbox })

    const result = await service.send("invitation", INVITATION)

    expect(result).toEqual({ delivered: true, queued: false, provider: "dev" })
    expect(provider.calls).toHaveLength(1)
  })

  it("sans file et en échec définitif, ne lève jamais", async () => {
    const provider = new FakeProvider(async () => {
      throw new EmailError("provider-failure", "indisponible", { retryable: true })
    })
    const outbox = new FakeOutbox()
    outbox.available = false
    const service = new EmailService({ provider, outbox, sendAttempts: 1 })

    await expect(service.send("invitation", INVITATION)).resolves.toEqual({
      delivered: false,
      queued: false,
      provider: "dev",
    })
  })

  it("délai d'envoi dépassé → laissé en file pour le worker", async () => {
    vi.useFakeTimers()
    const provider = new FakeProvider(() => new Promise(() => {}))
    const outbox = new FakeOutbox()
    const service = new EmailService({
      provider,
      outbox,
      sendTimeoutMs: 100,
      sendAttempts: 1,
    })

    const promise = service.send("invitation", INVITATION)
    await vi.advanceTimersByTimeAsync(101)
    const result = await promise

    expect(result).toEqual({ delivered: false, queued: true, provider: "dev" })
    expect(outbox.failed).toEqual(["id-1"])
  })
})

describe("emailService partagé", () => {
  it("est une instance du service sans configuration explicite", () => {
    expect(emailService).toBeInstanceOf(EmailService)
  })
})