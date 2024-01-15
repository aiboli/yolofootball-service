const DATACENTER_PROD = "datacenter.yolofootball.com";
// const DATACENTER_DEV = "localhost:3000";

const ENDPOINT_SELETOR = (env) => {
  if (env == "development") {
    return DATACENTER_PROD;
  } else {
    return DATACENTER_PROD;
  }
};

module.exports = ENDPOINT_SELETOR;
