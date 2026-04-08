import axios from "axios";

function isSuccessfulHistoricalResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (payload.success === true || payload.status === true) {
    return true;
  }

  return payload.message === "SUCCESS" && Array.isArray(payload.data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryConfig() {
  return {
    maxRetries: Number(process.env.HISTORICAL_FETCH_MAX_RETRIES ?? 3),
    baseDelayMs: Number(process.env.HISTORICAL_FETCH_BASE_DELAY_MS ?? 1000),
    maxDelayMs: Number(process.env.HISTORICAL_FETCH_MAX_DELAY_MS ?? 8000)
  };
}

function shouldRetry(error) {
  const status = error?.response?.status;
  return status === 403 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

export async function fetchHistoricalCandles(symbolToken, fromDate, toDate) {
  const data = {
    exchange: "NSE",
    symboltoken: symbolToken,
    interval: "ONE_MINUTE",
    fromdate: fromDate,
    todate: toDate
  };

  const authToken = process.env.ANGELONE_TOKEN;
  const config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-PrivateKey": "SyMaZXOB",
      "X-ClientLocalIP": "192.168.1.1",
      "X-ClientPublicIP": "167.103.4.209",
      "X-MACAddress": "D0-57-7E-BE-56-28",
      "X-ClientCode": "AACG029720",
      Authorization: `Bearer ${authToken}`
    },
    data
  };

  const { maxRetries, baseDelayMs, maxDelayMs } = getRetryConfig();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await axios.request(config);
      if (!isSuccessfulHistoricalResponse(response?.data)) {
        const apiMessage = response?.data?.message || "Unknown historical API error";
        const apiCode = response?.data?.errorCode ? ` (${response.data.errorCode})` : "";
        throw new Error(`${apiMessage}${apiCode}`);
      }

      return response.data;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxRetries && shouldRetry(error);
      if (!canRetry) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * (2 ** attempt), maxDelayMs);
      console.warn(
        `[Historical fetch] Retry ${attempt + 1}/${maxRetries} for token ${symbolToken} after ${delay}ms: ${error.response?.status ?? error.message}`
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Historical fetch failed");
}
