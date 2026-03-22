const getErrorMessage = (error, fallbackMessage) => {
  if (error.response && error.response.data) {
    if (typeof error.response.data === "string") {
      return error.response.data;
    }

    if (error.response.data.message) {
      return error.response.data.message;
    }
  }

  return fallbackMessage;
};

module.exports = {
  getErrorMessage,
};
