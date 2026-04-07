import axios from "axios";

const isVerboseBacktest = process.argv.includes("--verbose") || process.env.BACKTEST_VERBOSE === "true";

function isSuccessfulHistoricalResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (payload.success === true || payload.status === true) {
    return true;
  }

  return payload.message === "SUCCESS" && Array.isArray(payload.data);
}

const getBackTestData = async (symbolToken, fromDate, toDate) => {
  try {
    const data = {
      exchange: "NSE",
      symboltoken: symbolToken,
      interval: "ONE_MINUTE",
      fromdate: fromDate,
      todate: toDate
    };

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-PrivateKey': 'SyMaZXOB',
        'X-ClientLocalIP': '192.168.1.1',
        'X-ClientPublicIP': '167.103.4.209',
        'X-MACAddress': 'D0-57-7E-BE-56-28',
        'X-ClientCode': 'AACG029720', // removed extra space
        'Authorization': 'Bearer eyJhbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6IkFBQ0cwMjk3MjAiLCJyb2xlcyI6MCwidXNlcnR5cGUiOiJVU0VSIiwidG9rZW4iOiJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKMWMyVnlYM1I1Y0dVaU9pSmpiR2xsYm5RaUxDSjBiMnRsYmw5MGVYQmxJam9pZEhKaFpHVmZZV05qWlhOelgzUnZhMlZ1SWl3aVoyMWZhV1FpT2pNc0luTnZkWEpqWlNJNklqTWlMQ0prWlhacFkyVmZhV1FpT2lJM09ERTRNMk5qWkMxak1UZ3dMVE0xT0RVdFltUXpOaTAzTkdObE1EWTJOV00wT1RJaUxDSnJhV1FpT2lKMGNtRmtaVjlyWlhsZmRqSWlMQ0p2Ylc1bGJXRnVZV2RsY21sa0lqb3pMQ0p3Y205a2RXTjBjeUk2ZXlKa1pXMWhkQ0k2ZXlKemRHRjBkWE1pT2lKaFkzUnBkbVVpZlN3aWJXWWlPbnNpYzNSaGRIVnpJam9pWVdOMGFYWmxJbjE5TENKcGMzTWlPaUowY21Ga1pWOXNiMmRwYmw5elpYSjJhV05sSWl3aWMzVmlJam9pUVVGRFJ6QXlPVGN5TUNJc0ltVjRjQ0k2TVRjM05UVTFNakkxTml3aWJtSm1Jam94TnpjMU5EWTFOamMyTENKcFlYUWlPakUzTnpVME5qVTJOellzSW1wMGFTSTZJbUV6T0dFeU1HVmxMVFF5TWpndE5ERmhZaTA0TW1ZMkxUY3lOR1ExTkRoa01ETXpaQ0lzSWxSdmEyVnVJam9pSW4wLm1fWk9xUnJlUDNqazV5OUZjRzVLdzl2TkpuZ0JxZllFM0ctUjd4dXZIcWgydERCRWdlTy0tWlJhcmEyOWNGNUlJTktCUDVQNElISWRBNUJud01oMHhzeGExRXFUd3FJV1ZYTFZjME1tMmg0ZE5NTUNVWTYtclVHN180SEJ0bXdlVzZVVDFqZHJfTTFISmpmMmdoRHE3VWdKaVd3RlNwRFZxMGpjVkdPTzdrSSIsIkFQSS1LRVkiOiJTeU1hWlhPQiIsIlgtT0xELUFQSS1LRVkiOmZhbHNlLCJpYXQiOjE3NzU0NjU4NTYsImV4cCI6MTc3NTUwMDIwMH0.-VEll1_Trd-Zpu3h502yZGSjgj01fGAnr7FVjkAO5wE2z-8m6i0dPpf8733_6nUYB8XfyUl_49LJmZQJj1Ox6A'
      },
      data: data
    };

    const response = await axios.request(config);
    if (!isSuccessfulHistoricalResponse(response?.data)) {
      const apiMessage = response?.data?.message || "Unknown historical API error";
      const apiCode = response?.data?.errorCode ? ` (${response.data.errorCode})` : "";
      throw new Error(`${apiMessage}${apiCode}`);
    }

    return response.data;
  } catch (error) {
    if (isVerboseBacktest) {
      console.error("Error fetching data:", error.response?.data || error.message);
    }
    throw error; // optional: rethrow if needed
  }
};

export default getBackTestData;

// expected call format
// getBackTestData("5097","2026-01-05 09:00","2026-01-05 15:30");
