import Router from "express-promise-router";
import {
  createShow,
  createShowsBulk,
  getAllForUser,
  updateShow,
  createEpisode,
  updateEpisode,
  getBySlug,
  getRSSBySlug,
  setMeta,
  deleteEpisode,
  claimShow
} from "./logic";
const router = Router();

router.get(`/`, async (req, res) => {
  res.send(await getAllForUser(req.userId));
});

router.post(`/`, async (req, res) => {
  res.send(await createShow(req.userId, req.body));
});

router.post(`/bulk`, async (req, res) => {
  res.send(await createShowsBulk(req.userId, req.body));
});
router.put(`/claim/:identifier`, async (req, res) => {
  res.send(await claimShow(req.userId, req.params.identifier));
});

router.put(`/:identifier`, async (req, res) => {
  res.send(await updateShow(req.params.identifier, req.body));
});
router.get(`/:slug`, async (req, res) => {
  res.send(await getBySlug(req.params.slug));
});

router.post(`/:identifier/episodes`, async (req, res) => {
  res.send(await createEpisode(req.params.identifier, req.body));
});

router.put(`/:identifier/episodes/:eid`, async (req, res) => {
  res.send(
    await updateEpisode(req.params.identifier, req.params.eid, req.body, req)
  );
});
router.delete(`/:identifier/episodes/:eid`, async (req, res) => {
  res.send(await deleteEpisode(req.params.eid));
});
router.put(`/:identifier/episodes/:eid/meta`, async (req, res) => {
  console.log("set meta called with", req.body);
  res.send(await setMeta(req.params.identifier, req.params.eid, req.body, req));
});
export default router;
