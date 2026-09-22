import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useState } from "react"

import type { DeviceRegistrationInfo } from "@/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"

interface DeviceQrProps {
  info: DeviceRegistrationInfo
}

// The gadget scans this QR to register itself: it decodes the JSON payload,
// calls the register endpoint with the token, and completes the handshake.
export function DeviceQr({ info }: DeviceQrProps) {
  const credentials = {
    api_url: info.api_url,
    device_id: info.device_id,
    token: info.token,
  }
  // Compact form goes into the QR (smaller code); pretty form is easier to read
  // and copy for manual transfer. Both decode to the same object.
  const qrPayload = JSON.stringify(credentials)
  const readablePayload = JSON.stringify(credentials, null, 2)

  const [showRaw, setShowRaw] = useState(false)
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === readablePayload

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="text-sm font-medium">Step 2: Add device</p>
      <div className="rounded-lg bg-white p-4">
        <QRCodeSVG value={qrPayload} size={220} level="M" />
      </div>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Scan this code with the gadget to finish registering{" "}
        <span className="font-medium text-foreground">{info.name}</span>. The
        code contains a one-time token and won't be shown again.
      </p>

      <div className="w-full">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? (
            <ChevronDown className="mr-1 size-4" />
          ) : (
            <ChevronRight className="mr-1 size-4" />
          )}
          Enter credentials manually
        </Button>

        {showRaw && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Can't scan? Copy this JSON and paste it into the gadget's setup
              page.
            </p>
            <Textarea
              readOnly
              value={readablePayload}
              rows={6}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-end"
              onClick={() => copy(readablePayload)}
            >
              {isCopied ? (
                <>
                  <Check className="mr-1 size-4 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 size-4" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DeviceQr
